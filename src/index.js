// @ts-check
import './main.css';

import * as THREE from 'three';
import CopyShader from './lib/shaders/CopyShader';
import FilmShader from './lib/shaders/FilmShader';
import BadTVShader from './lib/shaders/BadTVShader';

/**
 * @author alteredq / http://alteredqualia.com/
 */
var EffectComposer = function(renderer, renderTarget) {
  this.renderer = renderer;

  if (renderTarget === undefined) {
    var parameters = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      stencilBuffer: false,
    };
    var size = renderer.getSize();
    renderTarget = new THREE.WebGLRenderTarget(
      size.width,
      size.height,
      parameters
    );
  }

  this.renderTarget1 = renderTarget;
  this.renderTarget2 = renderTarget.clone();

  this.writeBuffer = this.renderTarget1;
  this.readBuffer = this.renderTarget2;

  this.passes = [];

  this.copyPass = new ShaderPass(CopyShader);
};

EffectComposer.prototype = {
  swapBuffers: function() {
    var tmp = this.readBuffer;
    this.readBuffer = this.writeBuffer;
    this.writeBuffer = tmp;
  },

  addPass: function(pass) {
    this.passes.push(pass);
  },

  insertPass: function(pass, index) {
    this.passes.splice(index, 0, pass);
  },

  render: function(delta) {
    this.writeBuffer = this.renderTarget1;
    this.readBuffer = this.renderTarget2;

    var maskActive = false;

    var pass,
      i,
      il = this.passes.length;

    for (i = 0; i < il; i++) {
      pass = this.passes[i];

      if (!pass.enabled) continue;

      pass.render(
        this.renderer,
        this.writeBuffer,
        this.readBuffer,
        delta,
        maskActive
      );

      if (pass.needsSwap) {
        if (maskActive) {
          var context = this.renderer.context;

          context.stencilFunc(context.NOTEQUAL, 1, 0xffffffff);

          this.copyPass.render(
            this.renderer,
            this.writeBuffer,
            this.readBuffer,
            delta
          );

          context.stencilFunc(context.EQUAL, 1, 0xffffffff);
        }

        this.swapBuffers();
      }
    }
  },

  reset: function(renderTarget) {
    if (renderTarget === undefined) {
      var size = this.renderer.getSize();

      renderTarget = this.renderTarget1.clone();
      renderTarget.setSize(size.width, size.height);
    }

    this.renderTarget1.dispose();
    this.renderTarget2.dispose();
    this.renderTarget1 = renderTarget;
    this.renderTarget2 = renderTarget.clone();

    this.writeBuffer = this.renderTarget1;
    this.readBuffer = this.renderTarget2;
  },

  setSize: function(width, height) {
    this.renderTarget1.setSize(width, height);
    this.renderTarget2.setSize(width, height);
  },
};

/**
 * @author alteredq / http://alteredqualia.com/
 */
var RenderPass = function(
  scene,
  camera,
  overrideMaterial,
  clearColor,
  clearAlpha
) {
  this.scene = scene;
  this.camera = camera;

  this.overrideMaterial = overrideMaterial;

  this.clearColor = clearColor;
  this.clearAlpha = clearAlpha !== undefined ? clearAlpha : 1;

  this.oldClearColor = new THREE.Color();
  this.oldClearAlpha = 1;

  this.enabled = true;
  this.clear = true;
  this.needsSwap = false;
};

RenderPass.prototype = {
  render: function(renderer, writeBuffer, readBuffer, delta) {
    this.scene.overrideMaterial = this.overrideMaterial;

    if (this.clearColor) {
      this.oldClearColor.copy(renderer.getClearColor());
      this.oldClearAlpha = renderer.getClearAlpha();

      renderer.setClearColor(this.clearColor, this.clearAlpha);
    }

    renderer.render(this.scene, this.camera, readBuffer, this.clear);

    if (this.clearColor) {
      renderer.setClearColor(this.oldClearColor, this.oldClearAlpha);
    }

    this.scene.overrideMaterial = null;
  },
};

/**
 * @author alteredq / http://alteredqualia.com/
 */

var ShaderPass = function(shader, textureID) {
  this.textureID = textureID !== undefined ? textureID : 'tDiffuse';

  if (shader instanceof THREE.ShaderMaterial) {
    this.uniforms = shader.uniforms;

    this.material = shader;
  } else if (shader) {
    this.uniforms = THREE.UniformsUtils.clone(shader.uniforms);

    this.material = new THREE.ShaderMaterial({
      defines: shader.defines || {},
      uniforms: this.uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
    });
  }

  this.renderToScreen = false;

  this.enabled = true;
  this.needsSwap = true;
  this.clear = false;

  this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  this.scene = new THREE.Scene();

  this.quad = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), null);
  this.scene.add(this.quad);
};

ShaderPass.prototype = {
  render: function(renderer, writeBuffer, readBuffer, delta) {
    if (this.uniforms[this.textureID]) {
      this.uniforms[this.textureID].value = readBuffer;
    }

    this.quad.material = this.material;

    if (this.renderToScreen) {
      renderer.render(this.scene, this.camera);
    } else {
      renderer.render(this.scene, this.camera, writeBuffer, this.clear);
    }
  },
};

var BACKGROUND_COLOR = 0x1a1a1a;
var NEAR = 0;
var FAR = 2000;
var IMAGE_SCREEN_FRACTION = 0.92; // Matches width of text-overlay
var IMAGE_ASPECT_RATIO = 1;

function init() {
  var width = window.innerWidth;
  var height = window.innerHeight;
  var aspectRatio = width / height;

  var camera = new THREE.OrthographicCamera(
    width / -2, // left
    width / 2, // right
    height / 2, // top
    height / -2, // bottom
    NEAR,
    FAR
  );

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND_COLOR);

  // Create material from image
  var imageUrl = require('./res/grid.png');
  var imageTexture = new THREE.TextureLoader().load(imageUrl);
  var imageMaterial = new THREE.MeshBasicMaterial({ map: imageTexture });
  imageMaterial.transparent = true;
  imageMaterial.depthWrite = false;

  // Create plane and add it to the screne
  var planeWidth = IMAGE_SCREEN_FRACTION * width;
  var planeHeight = planeWidth * IMAGE_ASPECT_RATIO; // multipled by aR to maintain proportions
  var planeGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight, 1, 1);
  var plane = new THREE.Mesh(planeGeometry, imageMaterial);
  plane.position.y = (height - planeHeight) / 2; // Align to top
  scene.add(plane);

  // Init renderer
  var renderer = new THREE.WebGLRenderer();
  renderer.setSize(width, height);
  document.body.appendChild(renderer.domElement);

  // POST PROCESSING

  // Create Shader passes
  var renderPass = new RenderPass(scene, camera);
  var badTVPass = new ShaderPass(BadTVShader);
  var filmPass = new ShaderPass(FilmShader);
  var copyPass = new ShaderPass(CopyShader);

  // Add Shader passes to Composer. Order is important.
  var composer = new EffectComposer(renderer);
  composer.addPass(renderPass);
  composer.addPass(filmPass);
  composer.addPass(badTVPass);
  composer.addPass(copyPass);
  copyPass.renderToScreen = true;

  // Configure uniforms to match aesthetics
  badTVPass.uniforms.distortion.value = 0.75;
  badTVPass.uniforms.distortion2.value = 1;
  badTVPass.uniforms.speed.value = 0.05;
  badTVPass.uniforms.rollSpeed.value = 0;

  filmPass.uniforms.sCount.value = 625;
  filmPass.uniforms.sIntensity.value = 0.75;
  filmPass.uniforms.nIntensity.value = 1.25;
  filmPass.uniforms.grayscale.value = 0;

  function onResize() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    var aR = w / h;

    var scale = aR / aspectRatio;
    var scaleX = width / w;
    var scaleY = height / h;

    // Maintain original aspect-ratio
    plane.scale.y = scale;
    // Align to top - WIP
    // plane.position.y = (h - planeHeight) / 2;

    renderer.setSize(w, h);
    camera.updateProjectionMatrix();
  }

  var resizeTimeout = null;
  function scheduleOnResize() {
    window.clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(onResize, 20);
  }

  window.addEventListener('resize', scheduleOnResize, false);

  var shaderTime = 0;
  function animate() {
    shaderTime += 0.1;

    badTVPass.uniforms.time.value = shaderTime;
    filmPass.uniforms.time.value = shaderTime;

    requestAnimationFrame(animate);
    composer.render(0.1);
  }

  animate();
}

init();

/*

Remaining tasks:
  1. Resize or redraw plane when viewport resizes

Extra:
  1. Debug why tree-shaking doesn't seem to work (and we hence serve a 540kB bundle...)
  2. Load JS async

*/
