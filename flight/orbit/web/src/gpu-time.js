// The GPU's own time for a frame, where the browser gives it (EXT_disjoint_timer_query_webgl2: Chrome on
// most desktops; not Safari, nor Firefox by default). A frame's draws are bracketed by a query; its
// answer comes a frame or few later and is dropped when the GPU says its clock jumped (disjoint). The frame
// rate's controller (adapt.js) reads it to tell a picture that costs too much from a frame whose time goes
// elsewhere, and to step up without trying; the meter shows it. Where there is none, read() is null and
// both do without. MIT.

export class GpuTime {
  constructor(gl, { enabled = true } = {}) {
    this.gl = gl;
    this.ext = enabled && gl ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
    this.pending = [];
    this.active = null;
    this.ms = null;
  }

  get available() { return Boolean(this.ext); }

  begin() {
    const { gl, ext } = this;
    if (!ext || this.active || this.pending.length >= 4) return;
    const q = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  end() {
    if (!this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  // The latest frame's time, ms, once answered; null where there is none.
  read() {
    const { gl, ext } = this;
    if (!ext) return null;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    while (this.pending.length && gl.getQueryParameter(this.pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = this.pending.shift();
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      gl.deleteQuery(q);
      this.ms = disjoint ? null : ns / 1e6;
    }
    if (disjoint) this.ms = null;
    return this.ms;
  }
}
