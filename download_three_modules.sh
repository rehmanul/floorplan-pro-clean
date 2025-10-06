#!/bin/bash
mkdir -p public/libs/three/controls
mkdir -p public/libs/three/postprocessing
mkdir -p public/libs/three/shaders

wget -O public/libs/three/three.module.js https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js
wget -O public/libs/three/controls/OrbitControls.js https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/controls/OrbitControls.js
wget -O public/libs/three/postprocessing/EffectComposer.js https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/postprocessing/EffectComposer.js
wget -O public/libs/three/postprocessing/RenderPass.js https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/postprocessing/RenderPass.js
wget -O public/libs/three/postprocessing/OutlinePass.js https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/postprocessing/OutlinePass.js
wget -O public/libs/three/shaders/FXAAShader.js https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/shaders/FXAAShader.js
wget -O public/libs/three/postprocessing/ShaderPass.js https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/postprocessing/ShaderPass.js
