global.THREE = require("three");
const Matter = require("./Matter/Matter");
const canvasSketch = require("canvas-sketch");
require("three/examples/js/controls/OrbitControls");

const { color } = require("canvas-sketch-util");

const w = window;

const SETTINGS = {
    animate: true,
    context: "webgl",
    // TODO: Fix hz rate independent animations
    fps: 60,
    playbackRate: "throttle",
};

const CONFIG = {
    fog: false,

    //backgroundDarker: FUNCTIONS.backgroundDarker || 10,
    near: 0.01,
    far: 340000,
    fov: 80,
    cameraZ: 40000,
    cameraMovementRadius: 200,
    backgroundZ: 100,
};

const sketch = async ({ context }) => {
    window.maxZNonElevated = 0;
    window.maxZElevated = 0;

    w.renderer = new THREE.WebGLRenderer({
        canvas: context.canvas,
        antialias: true,
        powerPreference: "high-performance",
        //logarithmicDepthBuffer: true,
    });
    renderer.info.autoReset = false;
    //renderer.physicallyCorrectLights = true;

    // window.backgroundColor = color.offsetHSL();

    renderer.setClearColor("#1d1833");
    const camera = new THREE.PerspectiveCamera(
        CONFIG.fov,
        1,
        CONFIG.near,
        CONFIG.far
    );
    camera.position.set(0, 0, 10000);
    camera.position.set(50000, 0, 200000);
    const controls = new THREE.OrbitControls(camera, context.canvas);
    w.scene = new THREE.Scene();

    w.matter = new Matter();

    return {
        render({ frame, time }) {
            matter.render(time, frame);
            renderer.render(w.scene, camera);
        },
        resize({ pixelRatio, viewportWidth, viewportHeight }) {
            renderer.setPixelRatio(pixelRatio);
            renderer.setSize(viewportWidth, viewportHeight, false);
            camera.aspect = viewportWidth / viewportHeight;
            camera.updateProjectionMatrix();
        },
        // Dispose of events & renderer for cleaner hot-reloading
        unload() {
            controls.dispose();
            renderer.dispose();
        },
    };
};

canvasSketch(sketch, SETTINGS);
