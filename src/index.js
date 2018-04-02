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

var composer;
var plane;
var badTVPass, filmPass, renderPass, copyPass;

var BACKGROUND_COLOR = 0x1a1a1a;
var DISTANCE = 1200;
var FOV = 45;
var NEAR = 20;
var FAR = 3000;

function init() {
  var width = window.innerWidth;
  var height = window.innerHeight;
  var aspectRatio = width / height;

  var camera = new THREE.PerspectiveCamera(FOV, aspectRatio, NEAR, FAR);
  camera.position.z = DISTANCE;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND_COLOR);

  // Load image
  var imageUrl = require('./res/test2.png');

  var imageTexture = new THREE.TextureLoader().load(imageUrl);
  var imageMaterial = new THREE.MeshBasicMaterial({ map: imageTexture });
  imageMaterial.transparent = true;
  imageMaterial.depthWrite = false;

  // Add image plane

  var planeSize = Math.max(width, height);
  var planeGeometry = new THREE.PlaneGeometry(planeSize, planeSize, 1, 1);
  plane = new THREE.Mesh(planeGeometry, imageMaterial);
  plane.scale.x = 1;
  plane.scale.y = 1;
  scene.add(plane);

  // Init renderer
  var renderer = new THREE.WebGLRenderer();
  renderer.setSize(width, height);
  document.body.appendChild(renderer.domElement);

  // POST PROCESSING

  // Create Shader Passes
  renderPass = new RenderPass(scene, camera);
  badTVPass = new ShaderPass(BadTVShader);
  filmPass = new ShaderPass(FilmShader);
  copyPass = new ShaderPass(CopyShader);

  // Add Shader passes to Composer, order is important
  composer = new EffectComposer(renderer);
  composer.addPass(renderPass);
  composer.addPass(filmPass);
  composer.addPass(badTVPass);
  composer.addPass(copyPass);
  copyPass.renderToScreen = true;

  // Configure uniforms for aesthetics
  badTVPass.uniforms.distortion.value = 0.75;
  badTVPass.uniforms.distortion2.value = 1;
  badTVPass.uniforms.speed.value = 0.05;
  badTVPass.uniforms.rollSpeed.value = 0;

  filmPass.uniforms.sCount.value = 625;
  filmPass.uniforms.sIntensity.value = 0.75;
  filmPass.uniforms.nIntensity.value = 1.25;
  filmPass.uniforms.grayscale.value = 0;

  window.addEventListener(
    'resize',
    function onResize() {
      var width = window.innerWidth;
      var height = window.innerHeight;

      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      var newPlaneSize = Math.max(width, height);
      plane.scale.x = newPlaneSize / planeSize;
      plane.scale.y = newPlaneSize / planeSize;
    },
    false
  );
}

var shaderTime = 0;
function animate() {
  shaderTime += 0.1;

  badTVPass.uniforms.time.value = shaderTime;
  filmPass.uniforms.time.value = shaderTime;

  requestAnimationFrame(animate);
  composer.render(0.1);
}

init();
animate();
