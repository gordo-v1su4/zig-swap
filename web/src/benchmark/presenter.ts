const shader = `
struct Out { @builtin(position) pos:vec4f, @location(0) uv:vec2f };
@vertex fn vs(@builtin(vertex_index) i:u32)->Out {
  let p=array(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3))[i];
  var o:Out;o.pos=vec4f(p,0,1);o.uv=p*vec2f(.5,-.5)+vec2f(.5);return o;
}
@group(0) @binding(0) var tex:texture_2d<f32>;
@group(0) @binding(1) var smp:sampler;
@fragment fn fs(o:Out)->@location(0) vec4f{return vec4f(textureSample(tex,smp,o.uv).rgb,1);}`;
/** One GPU device, one owned texture per deck. PGM samples the selected texture again. */
export class DeckPresenter {
  device!: GPUDevice;
  context!: GPUCanvasContext;
  pipeline!: GPURenderPipeline;
  sampler!: GPUSampler;
  textures: GPUTexture[] = [];
  binds: GPUBindGroup[] = [];
  private bankBindings = new WeakMap<GPUTexture, GPUBindGroup>();
  constructor(public canvas: HTMLCanvasElement) {}
  async init(
    count: number,
    width: number,
    height: number,
    sizes?: { width: number; height: number }[],
  ) {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) throw new Error("WebGPU unavailable");
    this.device = await adapter.requestDevice();
    this.context = this.canvas.getContext("webgpu")!;
    const format = navigator.gpu.getPreferredCanvasFormat();
    this.canvas.width = 1920;
    this.canvas.height = 1260;
    this.context.configure({
      device: this.device,
      format,
      alphaMode: "opaque",
    });
    const module = this.device.createShaderModule({ code: shader });
    this.pipeline = this.device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: [{ format }] },
    });
    this.sampler = this.device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });
    for (let i = 0; i < count; i++) {
      const texture = this.device.createTexture({
        size: [sizes?.[i].width ?? width, sizes?.[i].height ?? height],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.textures.push(texture);
      this.binds.push(
        this.device.createBindGroup({
          layout: this.pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: texture.createView() },
            { binding: 1, resource: this.sampler },
          ],
        }),
      );
    }
  }
  upload(
    deck: number,
    source: VideoFrame | HTMLCanvasElement | HTMLVideoElement | GPUTexture,
  ) {
    if ("createView" in source) {
      let bind = this.bankBindings.get(source);
      if (!bind) {
        bind = this.device.createBindGroup({
          layout: this.pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: source.createView() },
            { binding: 1, resource: this.sampler },
          ],
        });
        this.bankBindings.set(source, bind);
      }
      this.binds[deck] = bind;
      return;
    }
    const t = this.textures[deck];
    this.device.queue.copyExternalImageToTexture({ source }, { texture: t }, [
      t.width,
      t.height,
    ]);
  }
  draw(pgm: number) {
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    const tile = (deck: number, x: number, y: number, w: number, h: number) => {
      pass.setViewport(x, y, w, h, 0, 1);
      pass.setBindGroup(0, this.binds[deck]);
      pass.draw(3);
    };
    tile(pgm, 320, 0, 1280, 720);
    for (let i = 0; i < this.binds.length; i++)
      tile(i, (i % 4) * 480, 720 + Math.floor(i / 4) * 270, 480, 270);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
  dispose() {
    this.textures.forEach((t) => t.destroy());
    this.context?.unconfigure();
    this.device?.destroy();
  }
}
