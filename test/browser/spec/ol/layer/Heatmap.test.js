import Feature from '../../../../../src/ol/Feature.js';
import HeatmapLayer from '../../../../../src/ol/layer/Heatmap.js';
import Map from '../../../../../src/ol/Map.js';
import Point from '../../../../../src/ol/geom/Point.js';
import VectorSource from '../../../../../src/ol/source/Vector.js';
import View from '../../../../../src/ol/View.js';
import {apply as applyTransform} from '../../../../../src/ol/transform.js';
import {containsCoordinate} from '../../../../../src/ol/extent.js';

describe('ol/layer/Heatmap', function () {
  /** @type {HTMLDivElement} */
  let target;
  /** @type {Map} */
  let map;
  /** @type {HeatmapLayer} */
  let layer;
  beforeEach(() => {
    target = document.createElement('div');
    target.style.width = '300px';
    target.style.height = '300px';
    document.body.appendChild(target);

    map = new Map({
      view: new View({
        center: [0, 0],
        resolution: 0.1,
      }),
      target: target,
    });
  });

  afterEach(() => {
    map.dispose();
    document.body.removeChild(target);
    layer.dispose();
  });

  describe('constructor', function () {
    it('can be constructed without arguments', function () {
      layer = new HeatmapLayer();
      expect(layer).to.be.an(HeatmapLayer);
    });

    it('has a default className', function () {
      layer = new HeatmapLayer({
        source: new VectorSource(),
      });
      map.addLayer(layer);
      map.renderSync();

      const canvas = layer.getRenderer().helper.getCanvas();
      expect(canvas.className).to.eql('ol-layer');
    });

    it('accepts a custom className', function () {
      layer = new HeatmapLayer({
        source: new VectorSource(),
        className: 'a-class-name',
      });
      map.addLayer(layer);
      map.renderSync();

      const canvas = layer.getRenderer().helper.getCanvas();
      expect(canvas.className).to.eql('a-class-name');
    });
  });

  describe('hit detection', function () {
    it('hit detects two distinct features', function (done) {
      const feature = new Feature({
        geometry: new Point([0, 0]),
        id: 1,
        weight: 10,
      });
      const feature2 = new Feature({
        geometry: new Point([14, 14]),
        id: 2,
        weight: 10,
      });

      const source = new VectorSource({
        features: [feature, feature2],
      });
      layer = new HeatmapLayer({
        source: source,
        blur: 10,
        radius: 10,
      });
      map.addLayer(layer);
      map.render();

      function hitTest(coordinate) {
        const features = map.getFeaturesAtPixel(
          map.getPixelFromCoordinate(coordinate)
        );
        return features.length ? features[0] : null;
      }

      const renderer = layer.getRenderer();
      renderer.worker_.addEventListener('message', function (event) {
        if (!renderer.hitRenderInstructions_) {
          return;
        }
        map.renderSync();

        let res;

        res = hitTest([0, 0]);
        expect(res).to.be(feature);
        res = hitTest([20, 0]);
        expect(res).to.be(null);
        res = hitTest([14, 14]);
        expect(res).to.be(feature2);
        res = hitTest([0, 14]);
        expect(res).to.be(null);

        done();
      });
    });
  });

  describe('useGradientOpacity', function () {
    it('the same level of opacity for all the values', function (done) {
      const feature = new Feature({
        geometry: new Point([0, 0]),
        id: 1,
        weight: 0.2,
      });

      const source = new VectorSource({
        features: [feature],
      });
      layer = new HeatmapLayer({
        source: source,
        blur: 10,
        radius: 10,
        useGradientOpacity: true,
      });
      map.addLayer(layer);
      map.render();

      let pixelContext;
      function getDataAtPixel(pixel, frameState, gl) {
        const renderPixel = applyTransform(
          [frameState.pixelRatio, 0, 0, frameState.pixelRatio, 0, 0],
          pixel.slice()
        );
        if (!gl) return null;
        const layerExtent = layer.getExtent();
        if (layerExtent) {
          const renderCoordinate = applyTransform(
            frameState.pixelToCoordinateTransform,
            pixel.slice()
          );

          /** get only data inside of the layer extent */
          if (!containsCoordinate(layerExtent, renderCoordinate)) {
            return null;
          }
        }

        const attributes = gl.getContextAttributes();
        if (!attributes || !attributes.preserveDrawingBuffer) {
          // we assume there is data at the given pixel (although there might not be)
          return new Uint8Array();
        }

        const x = Math.round(renderPixel[0]);
        const y = Math.round(renderPixel[1]);
        if (!pixelContext) {
          const pixelCanvas = document.createElement('canvas');
          pixelCanvas.width = 1;
          pixelCanvas.height = 1;
          pixelContext = pixelCanvas.getContext('2d');
        }
        pixelContext.clearRect(0, 0, 1, 1);
        let data;
        try {
          pixelContext.drawImage(gl.canvas, x, y, 1, 1, 0, 0, 1, 1);
          data = pixelContext.getImageData(0, 0, 1, 1).data;
        } catch (err) {
          return data;
        }

        return data[3];
      }

      layer.on('postrender', (e) => {
        const gl = e.context;
        let alpha, pixel;
        setTimeout(() => {
          pixel = map.getPixelFromCoordinate([0, 0]);
          alpha = getDataAtPixel(pixel, e.frameState, gl);
          expect(alpha).to.be(255);
          alpha = getDataAtPixel([pixel[0] - 15, pixel[1]], e.frameState, gl);
          expect(alpha).to.be(255);
          alpha = getDataAtPixel(
            [pixel[0] - 20, pixel[1] - 20],
            e.frameState,
            gl
          );
          expect(alpha).to.be(0);
          done();
        }, 1000);
      });
    });
  });
});
