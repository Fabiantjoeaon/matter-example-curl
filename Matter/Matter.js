const glsl = require("glslify");
const { default: GUI } = require("lil-gui");
const { math, random } = require("canvas-sketch-util");
require("three/examples/js/misc/GPUComputationRenderer");
const shaders = require("./shaders");

//const FBOHelper = require("../../FBOHelper.js");

const INC = 1000;
const RESOLUTION = 600;
const SIZE = 40 * INC;

//if (!window.gui) window.gui = new GUI();

// Implement particle fade/blur
// Maybe also this https://observablehq.com/@rreusser/strange-attractors-on-the-gpu-part-1

function capitalize(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function getSphere(radius) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const r = radius * Math.cbrt(Math.random());
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const x = r * sinPhi * cosTheta;
    const y = r * sinPhi * sinTheta;
    const z = r * cosPhi;
    return [x, y, z];
}

function getCube() {
    return [
        random.range(0, SIZE * 6),
        random.range(0, SIZE * 3),
        random.range(0, SIZE * 2),
    ];
}

// TODO: https://spite.github.io/codevember-2021/17/
// https://spite.github.io/genuary-2022/13/

class Matter {
    constructor() {
        const particleMass = 10;
        const settings = {
            // w = mass
            attractors: [
                new THREE.Vector4(0, 0, 0, 100000),
                // new THREE.Vector4(0, -200, 0, 5),
            ],
            lifeRange: [2, 8],
            variables: [],
        };

        // TODO: Add GUI options
        // HINT:
        // Two properties will be created based on the variable key name:
        //      1. A texture that gets feed into the simulation shader called: GPGP_texture_[Name]
        //      2. A texture that gets feed into the render shader called:     u[Name]Texture

        this.variables = {
            position: {
                size: 4,
                data: (i) => {
                    // Pos + life
                    return [
                        ...getCube(SIZE),
                        random.range(...settings.lifeRange),
                    ];
                },
                uniforms: {
                    uAttractorPositions: {
                        value: settings.attractors,
                    },
                    // HINT: Acceleration is how much velocity changes over time
                    // meaning that this value should change based on certain behaviour
                    // when applying mass for example

                    // FIXME: but the values are all the same now?
                    uAcceleration: {
                        value: new THREE.Vector3(
                            ...[1, 1, 1].map((i) => i * 1000)
                        ),
                    },
                },
                dependencies: ["velocity"],
                shader: shaders.simulationPositionShader({
                    attractorCount: settings.attractors.length,
                }),
            },
            velocity: {
                size: 4,
                data: (i) => {
                    return [
                        random.range(-1, 1),
                        random.range(-1, 1),
                        random.range(-1, 1),

                        // w = mass
                        particleMass,
                    ].map((i) => i * 1000);
                },
                dependencies: ["position"],
                shader: shaders.simulationVelocityShader({}),
            },
            ...settings.variables,
        };
        this.deltaTime = 0;
        this.initComputeRenderer();
        this.initParticles();
    }

    initParticles() {
        this.geometry = new THREE.BufferGeometry();

        const totalParticles = RESOLUTION * RESOLUTION;

        const positions = new Float32Array(totalParticles * 3);
        // Identifier for each pixel from simulation texture?
        // TODO: Still unclear, what texture feeds into what?
        // - The simulation
        const reference = new Float32Array(totalParticles * 2);
        for (let i = 0; i < totalParticles; i++) {
            // INITIAL POSITIONS
            // const x = random.range(0, SIZE);
            // const y = random.range(0, SIZE);
            // const z = random.range(0, SIZE);
            positions.set([0, 0, 0], i * 3);

            // row / col
            const xx = (i % RESOLUTION) / RESOLUTION;
            const yy = ~~(i / RESOLUTION) / RESOLUTION;
            reference.set([xx, yy], i * 2);
        }

        this.geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(positions, 3)
        );

        this.geometry.setAttribute(
            "reference",
            new THREE.BufferAttribute(reference, 2)
        );

        this.material = new THREE.ShaderMaterial({
            extensions: {
                derivatives: true,
            },
            side: THREE.DoubleSide,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            uniforms: {
                uTime: {
                    value: 0,
                },
            },
            vertexShader: shaders.particleVertexShader,
            fragmentShader: shaders.particleFragmentShader,
        });

        Object.values(this.variables).forEach((variable) => {
            this.material.uniforms[`u${variable.name}Texture`] = {
                value: null,
            };
        });

        this.mesh = new THREE.Points(this.geometry, this.material);
        this.mesh.position.x -= SIZE * 3;
        this.mesh.position.y -= SIZE * 1.5;
        this.mesh.position.z += SIZE;
        this.mesh.renderOrder = 0;
        scene.add(this.mesh);

        //this.initGUI();
        //this.setupFBOHelper();
    }

    // setupFBOHelper() {
    //     this.helper = new FBOHelper(renderer);
    //     this.helper.setSize(RESOLUTION, RESOLUTION);
    //     Object.values(this.variables).forEach((variable) => {
    //         const [rt1, rt2] = variable.instance.renderTargets;
    //         console.log(rt1, rt2.texture.image);
    //         this.helper.attach(rt1, `${variable.name}1`);
    //         this.helper.attach(rt2, `${variable.name}2`);
    //     });
    // }

    setUpDynamicVariable(variable) {
        variable.dt = this.gpuCompute.createTexture();
        const texture = variable.dt.image.data;

        for (let i = 0; i < texture.length; i += variable.size) {
            const [x, y, z, w] = variable.data(i);

            texture[i + 0] = x;
            if (variable.size >= 2) texture[i + 1] = y;
            if (variable.size >= 3) texture[i + 2] = z;
            if (variable.size >= 4) texture[i + 3] = w;
        }

        variable.instance = this.gpuCompute.addVariable(
            `GPGPU_texture_${variable.name}`,
            variable.shader,
            variable.dt
        );

        variable.instance.wrapS = THREE.RepeatWrapping;
        variable.instance.wrapT = THREE.RepeatWrapping;
        variable.instance.glslVersion = THREE.GLSL3;

        variable.instance.material.uniforms["uTime"] = { value: 0 };
        variable.instance.material.uniforms["uDelta"] = { value: 0 };

        variable.instance.material.uniforms = {
            ...variable.instance.material.uniforms,
            ...variable.uniforms,
        };
    }

    mapDependencies(variable) {
        this.gpuCompute.setVariableDependencies(variable.instance, [
            variable.instance,
            ...variable.dependencies.map((d) => this.variables[d].instance),
        ]);
    }

    initComputeRenderer() {
        this.gpuCompute = new THREE.GPUComputationRenderer(
            RESOLUTION,
            RESOLUTION,
            renderer
        );

        // TODO: FOR SAFARI
        // this.gpuCompute.setDataType(THREE.HalfFloatType);

        Object.entries(this.variables).forEach(([key, variable]) => {
            variable.name = capitalize(key);
            this.setUpDynamicVariable(variable);
        });
        Object.values(this.variables).forEach((variable) =>
            this.mapDependencies(variable)
        );

        const error = this.gpuCompute.init();
        if (error !== null) {
            console.error(error);
        }
    }

    // updateVariables(t, delta) {
    //     Object.values(this.variables).forEach((variable) => {
    //         this.material.uniforms[`u${variable.name}Texture`].value =
    //             this.gpuCompute.getCurrentRenderTarget(
    //                 this.variables[variable.name.toLowerCase()].instance
    //             ).texture;

    //         variable.instance.material.uniforms["uTime"].value = t;
    //         variable.instance.material.uniforms["uDelta"].value =
    //             this.deltaTime;
    //     });
    // }

    updateAttractor({ index, pos, enabled }) {
        this.variables["velocity"].material.uniforms["uAttractorPositions"][
            index
        ] = [...pos, w];
    }

    render(time, frame) {
        let t = time;
        // var now = performance.now();
        // var delta = (now - last) / 1000;
        //this.helper.update();

        this.deltaTime = time - this.deltaTime;
        if (this.deltaTime > 1) this.deltaTime = 1;

        this.gpuCompute.compute();
        Object.values(this.variables).forEach((variable) => {
            this.material.uniforms[`u${variable.name}Texture`].value =
                this.gpuCompute.getCurrentRenderTarget(
                    this.variables[variable.name.toLowerCase()].instance
                ).texture;

            variable.instance.material.uniforms["uTime"].value = t;
            variable.instance.material.uniforms["uDelta"].value =
                this.deltaTime;
        });

        this.material.uniforms.uTime.value = t;

        this.deltaTime = time;
    }

    initGUI() {
        // this.options = {
        //     uNoiseAmplitude: 4,
        //     uNoiseFreuqency: 4,
        //     uNoiseMaxDistance: 4,
        // };
        // gui.add(
        //     this.positionVariable.material.uniforms.uNoiseAmplitude,
        //     "value",
        //     0,
        //     20
        // ).name("uNoiseAmplitude");
        // gui.add(
        //     this.positionVariable.material.uniforms.uNoiseFrequency,
        //     "value",
        //     0,
        //     20
        // ).name("uNoiseFrequency");
        // gui.add(
        //     this.positionVariable.material.uniforms.uNoiseMaxDistance,
        //     "value",
        //     0,
        //     20
        // ).name("uNoiseMaxDistance");
    }
}

module.exports = Matter;
