import './main.css';

const THREE = require('three');
import CopyShader from './lib/shaders/CopyShader';
import BadTVShader from './lib/BadTVShader';
import StaticShader from './lib/StaticShader';

THREE.CopyShader = CopyShader;
THREE.BadTVShader = BadTVShader;
THREE.StaticShader = StaticShader;

/**
 * @author alteredq / http://alteredqualia.com/
 */
THREE.EffectComposer = function(renderer, renderTarget) {
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

  if (THREE.CopyShader === undefined)
    console.error('THREE.EffectComposer relies on THREE.CopyShader');

  this.copyPass = new THREE.ShaderPass(THREE.CopyShader);
};

THREE.EffectComposer.prototype = {
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

      if (pass instanceof THREE.MaskPass) {
        maskActive = true;
      } else if (pass instanceof THREE.ClearMaskPass) {
        maskActive = false;
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
THREE.RenderPass = function(
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

THREE.RenderPass.prototype = {
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

THREE.ShaderPass = function(shader, textureID) {
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

THREE.ShaderPass.prototype = {
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

/**
 * @author alteredq / http://alteredqualia.com/
 */

THREE.MaskPass = function(scene, camera) {
  this.scene = scene;
  this.camera = camera;

  this.enabled = true;
  this.clear = true;
  this.needsSwap = false;

  this.inverse = false;
};

THREE.MaskPass.prototype = {
  render: function(renderer, writeBuffer, readBuffer, delta) {
    var context = renderer.context;

    // don't update color or depth

    context.colorMask(false, false, false, false);
    context.depthMask(false);

    // set up stencil

    var writeValue, clearValue;

    if (this.inverse) {
      writeValue = 0;
      clearValue = 1;
    } else {
      writeValue = 1;
      clearValue = 0;
    }

    context.enable(context.STENCIL_TEST);
    context.stencilOp(context.REPLACE, context.REPLACE, context.REPLACE);
    context.stencilFunc(context.ALWAYS, writeValue, 0xffffffff);
    context.clearStencil(clearValue);

    // draw into the stencil buffer

    renderer.render(this.scene, this.camera, readBuffer, this.clear);
    renderer.render(this.scene, this.camera, writeBuffer, this.clear);

    // re-enable update of color and depth

    context.colorMask(true, true, true, true);
    context.depthMask(true);

    // only render where stencil is set to 1

    context.stencilFunc(context.EQUAL, 1, 0xffffffff); // draw if == 1
    context.stencilOp(context.KEEP, context.KEEP, context.KEEP);
  },
};

THREE.ClearMaskPass = function() {
  this.enabled = true;
};

THREE.ClearMaskPass.prototype = {
  render: function(renderer, writeBuffer, readBuffer, delta) {
    var context = renderer.context;

    context.disable(context.STENCIL_TEST);
  },
};

/**
 * DEMO SCRIPT
 */

var camera, scene, renderer;
var video, videoTexture, videoMaterial;
var composer;
var shaderTime = 0;
var badTVParams, badTVPass;
var staticParams, staticPass;
var renderPass, copyPass;
var pnoise, globalParams;

init();
animate();

function init() {
  camera = new THREE.PerspectiveCamera(55, 1080 / 720, 20, 3000);
  camera.position.z = 1000;
  scene = new THREE.Scene();

  //Load Video
  video = document.createElement('video');
  video.loop = true;
  video.src = require('./res/fits.mp4');
  video.play();

  //init video texture
  videoTexture = new THREE.Texture(video);
  videoTexture.minFilter = THREE.LinearFilter;
  videoTexture.magFilter = THREE.LinearFilter;

  videoMaterial = new THREE.MeshBasicMaterial({ map: videoTexture });

  //Add video plane
  var planeGeometry = new THREE.PlaneGeometry(1080, 720, 1, 1);
  var plane = new THREE.Mesh(planeGeometry, videoMaterial);
  scene.add(plane);
  plane.z = 0;
  plane.scale.x = plane.scale.y = 1.45;

  //init renderer
  renderer = new THREE.WebGLRenderer();
  renderer.setSize(800, 600);
  document.body.appendChild(renderer.domElement);

  //POST PROCESSING
  //Create Shader Passes
  renderPass = new THREE.RenderPass(scene, camera);
  badTVPass = new THREE.ShaderPass(THREE.BadTVShader);
  staticPass = new THREE.ShaderPass(THREE.StaticShader);
  copyPass = new THREE.ShaderPass(THREE.CopyShader);

  //set shader uniforms
  badTVParams = {
    distortion: 0.0,
    distortion2: 0.0,
    speed: 0.3,
    rollSpeed: 0,
  };

  staticParams = {
    amount: 0.5,
    size: 1.0,
  };

  onToggleShaders();
  onParamsChange();

  window.addEventListener('resize', onResize, false);
  onResize();
}

function onParamsChange() {
  //copy gui params into shader uniforms
  badTVPass.uniforms['distortion'].value = badTVParams.distortion;
  badTVPass.uniforms['distortion2'].value = badTVParams.distortion2;
  badTVPass.uniforms['speed'].value = badTVParams.speed;
  badTVPass.uniforms['rollSpeed'].value = badTVParams.rollSpeed;

  staticPass.uniforms['amount'].value = staticParams.amount;
  staticPass.uniforms['size'].value = staticParams.size;
}

function onToggleShaders() {
  //Add Shader Passes to Composer
  //order is important
  composer = new THREE.EffectComposer(renderer);
  composer.addPass(renderPass);

  composer.addPass(badTVPass);
  composer.addPass(staticPass);

  composer.addPass(copyPass);
  copyPass.renderToScreen = true;
}

function animate() {
  shaderTime += 0.1;
  badTVPass.uniforms['time'].value = shaderTime;
  staticPass.uniforms['time'].value = shaderTime;

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    if (videoTexture) videoTexture.needsUpdate = true;
  }

  requestAnimationFrame(animate);
  composer.render(0.1);
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
