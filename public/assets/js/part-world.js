const vec=a=>({x:a[0],y:a[1],z:a[2]});
const quat=a=>({x:a[0],y:a[1],z:a[2],w:a[3]});
const round=x=>Math.round(x*1000)/1000;

export class PartWorld {
  constructor(R,world,map,shape,authoritative=true) {
    this.R=R;this.world=world;this.map=map;this.shape=shape;
    this.authoritative=authoritative;
    this.colliders=new Map();this.bodies=new Map();this.changed=new Map();
    this.dirty=new Set();this.clock=0;
    map.parts.forEach((part,id)=>this.restore(id));
  }

  descriptor(part) {
    const s=part.s;
    const d=part.shape===1?this.R.ColliderDesc.cuboid(...s.map(x=>Math.max(.02,x/2))):
      this.R.ColliderDesc.convexHull(this.shape(part.shape,s));
    return d?.setFriction(.5).setRestitution(.12).setDensity(.7);
  }

  restore(id) {
    const part=this.map.parts[id];
    this.erase(id);
    if(!part.solid)return;
    const d=this.descriptor(part);
    if(!d)throw new Error('Invalid part collider: '+id);
    const c=this.world.createCollider(d.setTranslation(...part.p).setRotation(quat(part.q)));
    c.userData={map:true,part:id};this.colliders.set(id,c);
  }

  erase(id) {
    const b=this.bodies.get(id);
    if(b)this.world.removeRigidBody(b.body);
    else if(this.colliders.has(id))this.world.removeCollider(this.colliders.get(id),true);
    this.bodies.delete(id);this.colliders.delete(id);
  }

  activate(id,impulse=null) {
    if(!this.authoritative)return null;
    const part=this.map.parts[id];
    if(!part||part.anchored!==false||!part.solid||part.behavior)return null;
    let entry=this.bodies.get(id);
    if(entry?.gone)return null;
    if(!entry) {
      const old=this.changed.get(id);
      if(old?.gone)return null;
      this.erase(id);
      const body=this.world.createRigidBody(this.R.RigidBodyDesc.dynamic()
        .setTranslation(...(old?.p||part.p)).setRotation(quat(old?.q||part.q))
        .setCcdEnabled(true).setLinearDamping(.18).setAngularDamping(.65)
        .setAdditionalSolverIterations(2).setCanSleep(true));
      const collider=this.world.createCollider(this.descriptor(part),body);
      collider.userData={map:true,part:id};
      this.colliders.set(id,collider);
      entry={id,body,awake:this.clock};this.bodies.set(id,entry);
    } else {
      entry.body.setBodyType(this.R.RigidBodyType.Dynamic,true);
      entry.body.wakeUp();entry.awake=this.clock;
    }
    if(impulse)entry.body.applyImpulse(impulse,true);
    this.dirty.add(id);
    return entry;
  }

  push(id,x,z) {
    const part=this.map.parts[id];
    if(!part?.loose&&!this.bodies.has(id))return;
    const entry=this.activate(id);
    if(!entry)return;
    const v=entry.body.linvel(),mass=Math.max(.01,entry.body.mass());
    entry.body.applyImpulse({x:(x*16-v.x)*mass*.18,y:0,z:(z*16-v.z)*mass*.18},true);
  }

  blast(p,radius=12) {
    const nearby=[];
    this.map.parts.forEach((part,id)=>{
      if(part.anchored!==false||!part.solid||part.behavior||this.changed.get(id)?.gone)return;
      const b=this.bodies.get(id)?.body;
      const at=b?.translation()||vec(part.p);
      const reach=Math.min(5,Math.hypot(...part.s)/2);
      const d=Math.hypot(at.x-p[0],at.y-p[1],at.z-p[2]);
      if(d<radius+reach&&part.s[0]*part.s[1]*part.s[2]<2500)nearby.push({id,d,at});
    });
    nearby.sort((a,b)=>a.d-b.d);
    for(const {id,d,at} of nearby.slice(0,40)) {
      const entry=this.activate(id);if(!entry)continue;
      const mass=entry.body.mass(),length=Math.max(1,d);
      const strength=Math.max(9,55*(1-d/(radius+5)));
      entry.body.applyImpulse({x:(at.x-p[0])/length*strength*mass,
        y:((at.y-p[1])/length*strength+20)*mass,z:(at.z-p[2])/length*strength*mass},true);
      entry.body.applyTorqueImpulse({x:mass*2,y:mass,z:-mass*2},true);
    }
  }

  hide(id) {
    this.erase(id);const state={id,gone:true};this.changed.set(id,state);this.dirty.add(id);
  }

  setKinematic(id,p,q=this.map.parts[id].q) {
    if(!this.colliders.has(id))return;
    let entry=this.bodies.get(id);
    if(!entry) {
      this.erase(id);
      const body=this.world.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased().setTranslation(...p).setRotation(quat(q)));
      const c=this.world.createCollider(this.descriptor(this.map.parts[id]),body);
      c.userData={map:true,part:id};this.colliders.set(id,c);
      entry={id,body,awake:this.clock};this.bodies.set(id,entry);
    }
    entry.body.setTranslation(vec(p),true);entry.body.setNextKinematicTranslation(vec(p));
    entry.body.setRotation(quat(q),true);entry.body.setNextKinematicRotation(quat(q));
    this.dirty.add(id);
  }

  apply(states) {
    for(const state of states||[]) {
      if(!Number.isInteger(state.id)||!this.map.parts[state.id])continue;
      if(state.gone){this.hide(state.id);continue;}
      if(!Array.isArray(state.p)||!Array.isArray(state.q))continue;
      if(!this.colliders.has(state.id))this.restore(state.id);
      this.setKinematic(state.id,state.p,state.q);
      this.changed.set(state.id,state);
    }
    this.world.propagateModifiedBodyPositionsToColliders();
  }

  update(dt) {
    this.clock+=dt;
    if(!this.authoritative)return;
    for(const [id,entry] of this.bodies) {
      const b=entry.body;
      if(!b.isDynamic()||b.isSleeping())continue;
      const v=b.linvel(),w=b.angvel(),speed=Math.hypot(v.x,v.y,v.z),spin=Math.hypot(w.x,w.y,w.z);
      if(speed>160)b.setLinvel({x:v.x*160/speed,y:v.y*160/speed,z:v.z*160/speed},false);
      if(spin>16)b.setAngvel({x:w.x*16/spin,y:w.y*16/spin,z:w.z*16/spin},false);
      this.dirty.add(id);
    }
  }

  snapshot(full=false) {
    const out=[];
    for(const id of this.dirty) {
      const b=this.bodies.get(id)?.body;
      if(b) {
        const p=b.translation(),q=b.rotation();
        this.changed.set(id,{id,p:[p.x,p.y,p.z].map(round),q:[q.x,q.y,q.z,q.w].map(round)});
      }
      const state=this.changed.get(id);if(state)out.push(state);
    }
    if(!full)this.dirty.clear();
    return full?[...this.changed.values()]:out;
  }

  reset() {
    for(const id of new Set([...this.bodies.keys(),...this.changed.keys()]))this.restore(id);
    this.changed.clear();this.dirty.clear();
    this.world.propagateModifiedBodyPositionsToColliders();
  }
}
