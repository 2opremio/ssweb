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

var camera, scene, renderer;
var composer;
var shaderTime = 0;
var badTVPass, filmPass, renderPass, copyPass;

var BACKGROUND_COLOR = 0x222222;

function addShaderPasses() {
  // Add Shader passes to Composer, order is important
  composer = new EffectComposer(renderer);
  composer.addPass(renderPass);

  composer.addPass(filmPass);
  composer.addPass(badTVPass);

  composer.addPass(copyPass);
  copyPass.renderToScreen = true;
}

// Copy GUI params into shader uniforms
function configurePassesUniforms() {
  badTVPass.uniforms.distortion.value = 0.75;
  badTVPass.uniforms.distortion2.value = 1;
  badTVPass.uniforms.speed.value = 0.05;
  badTVPass.uniforms.rollSpeed.value = 0;

  filmPass.uniforms.sCount.value = 625;
  filmPass.uniforms.sIntensity.value = 0.75;
  filmPass.uniforms.nIntensity.value = 1.25;
}

function onResize() {
  var width = window.innerWidth;
  var height = window.innerHeight;

  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function init() {
  camera = new THREE.PerspectiveCamera(55, 1080 / 720, 20, 3000);
  camera.position.z = 1000;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND_COLOR);

  // Load image
  var imageUrl = require('./res/test.png');

  var imageTexture = new THREE.TextureLoader().load(imageUrl);
  var imageMaterial = new THREE.MeshBasicMaterial({ map: imageTexture });

  // Add video plane
  var planeGeometry = new THREE.PlaneGeometry(1080, 720, 1, 1);
  var plane = new THREE.Mesh(planeGeometry, imageMaterial);
  plane.scale.z = 0;
  plane.scale.x = 1.45;
  plane.scale.y = 1.45;
  scene.add(plane);

  // init renderer
  renderer = new THREE.WebGLRenderer();
  renderer.setSize(800, 600);
  document.body.appendChild(renderer.domElement);

  // POST PROCESSING
  // Create Shader Passes
  renderPass = new RenderPass(scene, camera);
  badTVPass = new ShaderPass(BadTVShader);
  filmPass = new ShaderPass(FilmShader);
  copyPass = new ShaderPass(CopyShader);

  // set shader uniforms
  filmPass.uniforms.grayscale.value = 0;

  addShaderPasses();
  configurePassesUniforms();

  window.addEventListener('resize', onResize, false);
  onResize();
}

function animate() {
  shaderTime += 0.1;

  badTVPass.uniforms.time.value = shaderTime;
  filmPass.uniforms.time.value = shaderTime;

  requestAnimationFrame(animate);
  composer.render(0.1);
}

init();
animate();
