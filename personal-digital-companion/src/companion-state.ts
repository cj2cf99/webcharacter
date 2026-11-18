// 待机可立即被打断；拖拽优先级最高，其余动作保留结束边界交接。
export type Clip = 'idle' | 'idle-special' | 'hover' | 'hover-loop' | 'hover-exit' | 'click' | 'work-enter' | 'work-loop' | 'work-exit' | 'drag-enter' | 'drag-loop' | 'drag-exit';
export class CompanionState {
  current: Clip = 'idle';
  work = false;
  over = false;
  clickPending = false;
  hoverPending = false;
  dragHeld = false;
  isDrag(): boolean { return this.current.startsWith('drag-'); }
  enter(): Clip | null {
    if (this.over) return null;
    this.over = true;
    if ((this.current === 'idle' || this.current === 'idle-special')) { this.current = 'hover'; return this.current; }
    return null;
  }
  leave(): Clip | null { this.over=false;this.hoverPending=false;if(this.current==='hover'||this.current==='hover-loop'){this.current='hover-exit';return this.current;}return null; }
  click(): Clip | null {
    if (this.isDrag()) return null;
    if ((this.current === 'idle' || this.current === 'idle-special')) { this.current = 'click'; this.hoverPending = false; return this.current; }
    this.clickPending=true;if(this.current==='hover'||this.current==='hover-loop'){this.current='hover-exit';return this.current;}return null;
  }
  setWork(on: boolean): Clip | null {
    this.work = on;
    if(on&&(this.current==='hover'||this.current==='hover-loop')){this.current='hover-exit';return this.current;}
    if(on && (this.current === 'idle' || this.current === 'idle-special')){this.current='work-enter';return this.current;}
    return null;
  }
  beginDrag(): boolean {
    if(this.dragHeld)return false;
    this.dragHeld=true;this.current='drag-enter';this.over=false;this.clickPending=false;this.hoverPending=false;return true;
  }
  endDrag(): Clip | null {
    this.dragHeld=false;
    if(this.current==='drag-enter'||this.current==='drag-loop'){this.current='drag-exit';return this.current;}return null;
  }
  ended(): Clip {
    if(this.current==='hover'||this.current==='hover-loop'){this.current=this.over&&!this.clickPending&&!this.work?'hover-loop':'hover-exit';return this.current;}
    if(this.current==='hover-exit'&&this.over&&!this.clickPending&&!this.work){this.current='hover';return this.current;}
    if(this.current === 'drag-enter'||this.current === 'drag-loop'){
      this.current=this.dragHeld?'drag-loop':'drag-exit';return this.current;
    }
    if(this.current === 'drag-exit'){this.current=this.work?'work-enter':'idle';return this.current;}
    if (this.current === 'work-enter' || this.current === 'work-loop') {
      this.current = this.work && !this.clickPending ? 'work-loop' : 'work-exit';
    } else {
      if (this.clickPending) { this.clickPending = false; this.hoverPending = false; this.current = 'click'; }
      else if (this.hoverPending && this.over) { this.hoverPending = false; this.current = 'hover'; }
      else if (this.work) this.current = 'work-enter';
      else this.current = 'idle';
    }
    return this.current;
  }
  reset() {
    this.current = 'idle'; this.work = false; this.over = false;
    this.clickPending = false; this.hoverPending = false;this.dragHeld=false;
  }
}
