// Original sustained title score. D-minor voicings from Compound with worn cassette coloration.
// Fixed voice pools, no arpeggiator. Created only after a user gesture.
export class CassetteDrone {
    constructor(context) {
      this.ctx = context;
      this.sources = [];
      this.nodes = [];
      this.chords = [[38,45,48],[38,41,45],[38,43,48],[38,45,48],[38,43,46],[38,41,48]];
      this.nextChange = context.currentTime + 30;
      this.chordIndex = 0;
      this.activeBank = 0;
      const own = node => { this.nodes.push(node); return node; };
      const gain = value => { const n = own(context.createGain()); n.gain.value = value; return n; };
      const filter = (type,hz,q=.7) => { const n=own(context.createBiquadFilter());n.type=type;n.frequency.value=hz;n.Q.value=q;return n; };
      const oscillator = (hz,type='sine') => { const n=own(context.createOscillator());n.type=type;n.frequency.value=hz;this.sources.push(n);return n; };
      this.master = gain(0);
      this.analyser = own(context.createAnalyser());
      this.analyser.fftSize = 2048;
      const limiter = own(context.createDynamicsCompressor());
      limiter.threshold.value=-10;limiter.knee.value=8;limiter.ratio.value=6;limiter.attack.value=.01;limiter.release.value=.3;
      this.master.connect(limiter).connect(this.analyser).connect(context.destination);
      const music = gain(1);
      const pre = gain(1.9);
      this.saturator = own(context.createWaveShaper());
      this.saturator.oversample='2x';
      const low = filter('lowpass',1450,.55);
      const high = filter('highpass',31,.6);
      const output = gain(.72);
      music.connect(pre).connect(this.saturator).connect(low).connect(high).connect(output).connect(this.master);

      // Restrained, dark room tail before tape coloration.
      const reverb = own(context.createConvolver());
      const impulse = context.createBuffer(2,Math.ceil(context.sampleRate*4.5),context.sampleRate);
      let seed = 404;
      const random = () => { seed=(1664525*seed+1013904223)>>>0;return seed/4294967296; };
      for(let channel=0;channel<2;channel++) {
        const data=impulse.getChannelData(channel);let smooth=0;
        for(let i=0;i<data.length;i++){smooth=.76*smooth+.24*(random()*2-1);data[i]=smooth*Math.exp(-i/context.sampleRate*1.65);}
      }
      reverb.buffer=impulse;
      reverb.connect(gain(.26)).connect(music);
      const wave=context.createPeriodicWave(new Float32Array(7),new Float32Array([0,1,.2,.08,.027,.01,.003]));
      const wow=oscillator(.23), flutter=oscillator(5.7), drift=oscillator(.037);
      this.wowGain=gain(6);this.flutterGain=gain(.9);this.driftGain=gain(2.6);
      wow.connect(this.wowGain);flutter.connect(this.flutterGain);drift.connect(this.driftGain);
      const tapePitch = node => {this.wowGain.connect(node.detune);this.flutterGain.connect(node.detune);this.driftGain.connect(node.detune);};
      const hz = midi => 440*Math.pow(2,(midi-69)/12);
      this.banks = [0,1].map(bankIndex => {
        const level=gain(bankIndex===0?1:0);
        level.connect(music);level.connect(reverb);
        const voices=this.chords[0].map((note,i)=>{
          const osc=oscillator(hz(note));osc.setPeriodicWave(wave);osc.detune.value=[-2.4,1.7,.5][i];tapePitch(osc);
          const tone=filter('lowpass',[440,570,730][i],.45);
          const amp=gain([.18,.115,.085][i]);
          const pan=own(context.createStereoPanner());pan.pan.value=[-.22,.21,.035][i];
          osc.connect(tone).connect(amp).connect(pan).connect(level);
          const breathe=oscillator([.021,.027,.017][i]);breathe.connect(gain(.007)).connect(amp.gain);
          return osc;
        });
        return {level,voices};
      });
      const sub=oscillator(hz(26));tapePitch(sub);sub.connect(gain(.073)).connect(music);
      // A quiet, filtered cassette noise floor, not crackles or rhythmic static.
      const hiss=own(context.createBufferSource());
      const noise=context.createBuffer(1,context.sampleRate*5,context.sampleRate);
      const noiseData=noise.getChannelData(0);
      for(let i=0;i<noiseData.length;i++)noiseData[i]=random()*2-1;
      hiss.buffer=noise;hiss.loop=true;this.sources.push(hiss);
      this.hissGain=gain(.006);
      hiss.connect(filter('highpass',950)).connect(filter('lowpass',4100,.55)).connect(this.hissGain).connect(this.master);
      for(const source of this.sources)source.start();
      this.setWear(65);
      this.generation = 0;
      this.timer=setInterval(()=>this.schedule(),250);

    }
    setWear(value) {
      const wear=value/100, now=this.ctx.currentTime;
      this.wowGain.gain.setTargetAtTime(1+wear*9,now,.4);
      this.flutterGain.gain.setTargetAtTime(.2+wear*1.4,now,.4);
      this.driftGain.gain.setTargetAtTime(.5+wear*4,now,.4);
      this.hissGain.gain.setTargetAtTime(.001+wear*.011,now,.4);
      const curve=new Float32Array(2048), drive=1.1+wear*1.9;
      for(let i=0;i<curve.length;i++){const x=i/(curve.length-1)*2-1;curve[i]=Math.tanh(x*drive)/Math.tanh(drive);}
      this.saturator.curve=curve;
    }
    schedule() {
      const now=this.ctx.currentTime;
      if(now+.6<this.nextChange)return;
      const start=Math.max(now+.05,this.nextChange), duration=8;
      this.chordIndex=(this.chordIndex+1)%this.chords.length;
      const outgoing=this.banks[this.activeBank], incoming=this.banks[1-this.activeBank];
      incoming.voices.forEach((voice,i)=>voice.frequency.setValueAtTime(440*Math.pow(2,(this.chords[this.chordIndex][i]-69)/12),start));
      const up=new Float32Array(128),down=new Float32Array(128);
      for(let i=0;i<128;i++){up[i]=(1-Math.cos(i/127*Math.PI))/2;down[i]=1-up[i];}
      incoming.level.gain.setValueCurveAtTime(up,start,duration);
      outgoing.level.gain.setValueCurveAtTime(down,start,duration);
      this.activeBank=1-this.activeBank;this.nextChange=start+30;
    }
    setVolume(value,fade=.3) {this.master.gain.setTargetAtTime(value/100*.45,this.ctx.currentTime,fade);}
    async resume(value) {const generation=++this.generation;await this.ctx.resume();if(generation===this.generation)this.setVolume(value,1.1);}
    async pause() {
      const generation=++this.generation;
      this.setVolume(0,.13);
      await new Promise(resolve=>setTimeout(resolve,650));
      if(generation===this.generation&&this.ctx.state!=='closed')await this.ctx.suspend();
    }
    status() {return {context:this.ctx.state,sources:this.sources.length,arpeggiators:0};}
    async dispose() {
      ++this.generation;
      clearInterval(this.timer);
      for(const source of this.sources){try{source.stop();}catch{}}
      for(const node of this.nodes)node.disconnect();
      if(this.ctx.state!=='closed')await this.ctx.close();
    }
  }
