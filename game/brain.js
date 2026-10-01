export class BrainClient {
  constructor() {
    this.worker = new Worker('/game/brain.worker.js', {type:'module'});
    this.outputs = new Map();
    this.worker.onmessage = e => {
      if (e.data?.type !== 'brain') return;
      for (const o of e.data.out || []) this.outputs.set(o.id, o);
    };
  }
  reset(){this.worker.postMessage({type:'reset'});this.outputs.clear();}
  ensure(flies){this.worker.postMessage({type:'ensure',flies});}
  tick(flies){this.worker.postMessage({type:'tick',flies});}
  get(id){return this.outputs.get(id) || {turn:0,thrust:0.45,up:0,escape:0,attack:0,social:0,approach:0,freeze:0,signal:'EXPLORE'};}
}
