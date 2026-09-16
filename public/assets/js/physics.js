import {PartWorld} from './part-world.js?v=2';

export const STEP=1/60;
export const VERSION=8;
export const MAX_STEP_HEIGHT=3.515206;
export const WALK_SPEED=16;

const DT=STEP/2;
const GRAVITY=196.2;
const RADIUS=0.85;
const SKIN=0.035;
const STEP_SPEED=20;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const vec=a=>({x:a[0],y:a[1],z:a[2]});
const yawQuaternion=y=>({
  x:0,
  y:Math.sin(y/2),
  z:0,
  w:Math.cos(y/2)
});

export function roundedPoints(shape,size) {
  const points=[];

  if(shape===0) {
    for(let y=0;y<=12;y++)for(let x=0;x<24;x++) {
      const a=y*Math.PI/12,b=x*Math.PI/12;
      points.push(
        Math.sin(a)*Math.cos(b)*size[0]/2,
        Math.cos(a)*size[1]/2,
        Math.sin(a)*Math.sin(b)*size[2]/2
      );
    }
  } else {
    for(const end of [-0.5,0.5])for(let i=0;i<24;i++) {
      const a=i*Math.PI/12;
      if(shape===2) {
        points.push(
          end*size[0],
          Math.cos(a)*size[1]/2,
          Math.sin(a)*size[2]/2
        );
      } else {
        points.push(
          Math.cos(a)*size[0]/2,
          end*size[1],
          Math.sin(a)*size[2]/2
        );
      }
    }
  }

  return new Float32Array(points);
}

export class Physics {
  constructor(R,map,{authoritative=true}={}) {
    this.R=R;
    this.map=map;
    this.players=new Map();
    this.events=[];
    this.time=0;

    this.world=new R.World({x:0,y:-GRAVITY,z:0});
    this.authoritative=authoritative;
    this.world.timestep=DT;

    this.controller=this.world.createCharacterController(SKIN);
    this.controller.setSlideEnabled(true);
    this.controller.setMaxSlopeClimbAngle(Math.PI/4);
    this.controller.setMinSlopeSlideAngle(Math.PI/4+0.01);
    this.controller.setApplyImpulsesToDynamicBodies(false);

    this.parts=new PartWorld(R,this.world,map,roundedPoints,authoritative);

    this.world.step();
  }

  spawn() {
    const candidates=this.map.spawns.map(p=>p.slice());

    for(const p of this.map.spawns)for(let i=0;i<8;i++) {
      const angle=i*Math.PI/4;
      const origin={
        x:p[0]+Math.sin(angle)*5,
        y:p[1]+2,
        z:p[2]+Math.cos(angle)*5
      };

      const hit=this.ray(
        origin,{x:0,y:-1,z:0},6,null,
        c=>!!c.userData?.map
      );

      if(hit&&hit.normal.y>0.7) {
        candidates.push([
          origin.x,
          origin.y-hit.timeOfImpact+0.1,
          origin.z
        ]);
      }
    }

    let best=candidates[0]||[0,20,0],score=-1;

    for(const p of candidates) {
      let distance=Infinity;

      for(const a of this.players.values()) {
        const b=a.body.translation();
        distance=Math.min(
          distance,
          Math.hypot(p[0]-b.x,p[1]-b.y,p[2]-b.z)
        );
      }

      if(distance>score) {
        score=distance;
        best=p;
      }
    }

    return best.slice();
  }

  add(id,position=this.spawn(),proxy=false) {
    this.remove(id);

    const body=this.world.createRigidBody(
      this.R.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(...position)
    );

    const collider=this.world.createCollider(
      this.R.ColliderDesc.capsule(3-RADIUS,RADIUS)
        .setTranslation(0,3,0)
        .setCollisionGroups(0x00020003)
        .setFriction(0)
        .setRestitution(0),
      body
    );

    const a={
      id,body,collider,
      dead:false,groundTime:0,climbCooldown:0,climbing:false,voidSent:false,
      colliders:[collider],
      proxy,
      yaw:0,
      grounded:false,
      stepTarget:null,
      lastGround:-100,
      jumpUntil:0,
      jumpCooldown:0,
      vy:0,
      state:'Idle',
      speed:0,
      ack:0,
      revision:0,
      velocity:{x:0,y:0,z:0},
      input:{x:0,z:0,j:false}
    };

    collider.userData={player:id};
    this.players.set(id,a);
    this.world.step();
    return a;
  }

  remove(id) {
    const a=this.players.get(id);

    if(a) {
      this.world.removeRigidBody(a.body);
      this.players.delete(id);
    }
  }

  place(a,p,q=[0,0,0,1]) {
    a.yaw=Math.atan2(
      2*(q[3]*q[1]+q[0]*q[2]),
      1-2*(q[1]*q[1]+q[0]*q[0])
    );

    a.body.setTranslation(vec(p),true);
    a.body.setNextKinematicTranslation(vec(p));
    a.body.setRotation(yawQuaternion(a.yaw),true);
    a.body.setNextKinematicRotation(yawQuaternion(a.yaw));

    a.dead=false; a.collider.setEnabled(true);
    a.voidSent=false; a.groundTime=0; a.climbing=false;
    a.vy=0;
    a.stepTarget=null;
    a.jumpUntil=0;
    a.jumpCooldown=0;
    a.lastGround=-100;
    a.grounded=false;
    a.velocity={x:0,y:0,z:0};
    a.speed=0;
    a.state='Idle';

    this.world.propagateModifiedBodyPositionsToColliders();
  }

  proxy(id,p,q) {
    const a=this.players.get(id)||this.add(id,p,true);
    this.place(a,p,q);
  }

  input(a,input) {
    const x=Number.isFinite(input.x)?input.x:0;
    const z=Number.isFinite(input.z)?input.z:0;
    const length=Math.max(1,Math.hypot(x,z));

    a.input={x:x/length,z:z/length,j:!!input.j};

    if(input.j)a.jumpUntil=this.time+0.12;
  }

  ray(origin,direction,length,a,predicate) {
    return this.world.castRayAndGetNormal(
      new this.R.Ray(origin,direction),
      length,true,
      undefined,undefined,undefined,
      a?.body,c=>!c.userData?.cosmetic&&(!predicate||predicate(c))
    );
  }

  sweep(a,desired,snap=false) {
    const c=this.controller;
    c.disableAutostep();
    if(snap)c.enableSnapToGround(0.18);
    else c.disableSnapToGround();
    c.computeColliderMovement(a.collider,desired,undefined,undefined,
      other=>!other.userData?.cosmetic&&other.parent()?.handle!==a.body.handle);
    const m=c.computedMovement();
    const obstacles=[];
    for(let i=0;i<c.numComputedCollisions();i++) {
      const hit=c.computedCollision(i);
      if(hit?.collider?.userData?.map&&hit.normal1.y<0.7&&hit.normal1.y>-.2&&
         desired.x*hit.normal1.x+desired.z*hit.normal1.z<-.00001) {
        obstacles.push({point:{...hit.witness1},normal:{...hit.normal1}});
        if(Math.hypot(a.input.x,a.input.z)>.1&&desired.y<=0) {
          this.parts.push(hit.collider.userData.part,a.input.x,a.input.z);
        }
      }
    }
    return {x:m.x,y:m.y,z:m.z,grounded:c.computedGrounded(),obstacles};
  }

  translate(a,p) {
    a.body.setTranslation(p,true);
    a.body.setNextKinematicTranslation(p);
    this.world.propagateModifiedBodyPositionsToColliders();
  }

  findStep(a,desired,obstacles) {
    const length=Math.hypot(desired.x,desired.z);
    if(length<0.0001)return null;
    const p=a.body.translation();
    const dx=desired.x/length,dz=desired.z/length;
    const candidates=[];
    for(const contact of obstacles) {
      const n=contact.normal,point=contact.point;
      const flat=Math.hypot(n.x,n.z);
      if(flat<.1)continue;
      const hit=this.ray({
        x:point.x-n.x/flat*.08,
        y:p.y+MAX_STEP_HEIGHT,
        z:point.z-n.z/flat*.08
      },{x:0,y:-1,z:0},MAX_STEP_HEIGHT,a,c=>!!c.userData?.map);
      if(!hit||hit.normal.y<Math.SQRT1_2||hit.timeOfImpact<.0001)continue;
      const top=p.y+MAX_STEP_HEIGHT-hit.timeOfImpact;
      const rise=top+SKIN-p.y;
      if(rise<.04||rise>MAX_STEP_HEIGHT+.003)continue;
      candidates.push({y:top+SKIN,x:dx,z:dz});
    }
    candidates.sort((a,b)=>a.y-b.y);
    for(const target of candidates) {
      const height=target.y-p.y;
      const up=this.sweep(a,{x:0,y:height,z:0});
      if(up.y<height-.005)continue;
      this.translate(a,{x:p.x,y:target.y,z:p.z});
      const across=this.sweep(a,{x:desired.x,y:0,z:desired.z});
      this.translate(a,p);
      if(across.x*dx+across.z*dz<length*.95||Math.abs(across.y)>.02)continue;
      return target;
    }
    return null;
  }

  move(a,desired,steps=false) {
    const p=a.body.translation();
    const speed=Math.hypot(desired.x,desired.z);
    if(a.stepTarget&&(!steps||speed<.001||
      desired.x*a.stepTarget.x+desired.z*a.stepTarget.z<speed*.1))a.stepTarget=null;
    let m=this.sweep(a,desired,steps&&!a.stepTarget);
    if(steps&&!a.stepTarget&&m.obstacles.length) {
      a.stepTarget=this.findStep(a,desired,m.obstacles);
    }
    if(a.stepTarget) {
      const rise=clamp(a.stepTarget.y-p.y,0,STEP_SPEED*DT);
      const up=this.sweep(a,{x:0,y:rise,z:0});
      if(up.y<rise-.005) {
        a.stepTarget=null;
      } else {
        this.translate(a,{x:p.x,y:p.y+up.y,z:p.z});
        const across=this.sweep(a,{x:desired.x,y:0,z:desired.z});
        this.translate(a,p);
        m={...across,y:up.y+across.y};
      }
    }
    const next={x:p.x+m.x,y:p.y+m.y,z:p.z+m.z};
    if(desired.y<=0&&!a.stepTarget) {
      const floor=this.ray({x:next.x,y:p.y+.1,z:next.z},
        {x:0,y:-1,z:0},.1+Math.max(0,p.y-next.y)+SKIN*2,a);
      if(floor&&floor.normal.y>=Math.SQRT1_2) {
        const y=p.y+.1-floor.timeOfImpact+SKIN;
        if(y>=next.y&&y<=p.y+SKIN) {
          next.y=y;
          m.grounded=true;
        }
      }
    }
    const stepping=!!a.stepTarget;
    if(a.stepTarget&&next.y>=a.stepTarget.y-.005) {
      this.translate(a,next);
      const support=this.sweep(a,{x:0,y:-.18,z:0});
      this.translate(a,p);
      if(support.grounded&&support.y>-.175)a.stepTarget=null;
    }
    this.translate(a,next);
    return {x:next.x-p.x,y:next.y-p.y,z:next.z-p.z,
      grounded:m.grounded||stepping,stepping};
  }

  correct(a,delta) {
    const target=a.stepTarget;
    a.stepTarget=null;
    const moved=this.move(a,delta);
    a.stepTarget=target;
    return moved;
  }

  support(a) {
    const p=a.body.translation();
    for(const [x,z] of [[0,0],[.58,0],[-.58,0],[0,.58],[0,-.58]]) {
      const hit=this.ray({x:p.x+x,y:p.y+.12,z:p.z+z},{x:0,y:-1,z:0},.26,a);
      if(hit&&hit.normal.y>=Math.SQRT1_2)return true;
    }
    return false;
  }

  ladder(a) {
    if(this.time<a.climbCooldown||a.dead)return null;
    const p=a.body.translation(),i=a.input;
    for(const ladder of this.map.ladders||[]) {
      const intact=ladder.parts.filter(id=>{const change=this.parts.changed.get(id);return !change||!change.gone&&(!change.p||Math.hypot(...change.p.map((v,k)=>v-this.map.parts[id].p[k]))<.3);});
      if(intact.length<3)continue;
      const lo=ladder.min,hi=ladder.max;
      if(p.y+4<lo[1]||p.y>hi[1]+.55)continue;
      const side=ladder.axis===0?'z':'x';
      const along=ladder.axis===0?'x':'z';
      const k=ladder.axis===0?2:0,j=ladder.axis;
      const middle=(lo[k]+hi[k])/2;
      if(p[along]<lo[j]-.5||p[along]>hi[j]+.5||Math.abs(p[side]-middle)>(hi[k]-lo[k])/2+RADIUS+.25)continue;
      if(i[side]*(middle-p[side])>.04||a.climbing&&Math.hypot(i.x,i.z)<.05)return ladder;
    }
    return null;
  }

  setDead(a,dead) {
    a.dead=dead; a.collider.setEnabled(!dead);
    if(dead) {a.input={x:0,z:0,j:false};a.vy=0;a.speed=0;a.state='Dead';a.stepTarget=null;}
  }

  step() {
    this.events.length=0;
    for(let n=0;n<2;n++) {
      this.time+=DT;
      for(const a of this.players.values()) {
        if(a.proxy||a.dead)continue;
        const wasGrounded=a.grounded;
        const input=a.input;
        const support=wasGrounded&&!a.stepTarget&&this.support(a);
        a.groundTime=support?a.groundTime+DT:0;
        if(support)a.lastGround=this.time;
        const ladder=this.ladder(a);
        a.climbing=!!ladder;
        if(a.jumpUntil>this.time&&this.time>=a.jumpCooldown&&
          (ladder||a.groundTime>=DT*2||this.time-a.lastGround<.06&&!wasGrounded)) {
          a.vy=50;a.stepTarget=null;a.grounded=false;a.groundTime=0;
          a.climbing=false;a.climbCooldown=this.time+.35;
          a.lastGround=-100;a.jumpUntil=0;a.jumpCooldown=this.time+.2;
          this.events.push({id:a.id,name:'jump'});
        }
        a.vy=a.climbing?Math.hypot(input.x,input.z)*9:
          a.stepTarget?0:Math.max(-180,a.vy-GRAVITY*DT);
        const beforeY=a.vy;
        const m=this.move(a,{x:input.x*WALK_SPEED*DT,y:a.vy*DT,z:input.z*WALK_SPEED*DT},
          wasGrounded&&a.vy<=0&&!a.climbing);
        a.grounded=m.grounded&&beforeY<=0;
        if(a.grounded) a.vy=0;
        else if(beforeY>0&&m.y<beforeY*DT-.001&&!a.climbing)a.vy=0;
        if(a.grounded&&!wasGrounded&&beforeY<-65)this.events.push({id:a.id,name:'fall'});
        a.velocity={x:m.x/DT,y:a.vy,z:m.z/DT};
        a.speed=Math.hypot(a.velocity.x,a.velocity.z);
        if(Math.hypot(input.x,input.z)>.05) {
          const goal=Math.atan2(input.x,input.z);
          const turn=Math.atan2(Math.sin(goal-a.yaw),Math.cos(goal-a.yaw));
          a.yaw+=clamp(turn,-20*DT,20*DT);
        }
        const q=yawQuaternion(a.yaw);
        a.body.setRotation(q,true);a.body.setNextKinematicRotation(q);
        a.state=a.climbing?'Climb':a.grounded||beforeY<=0&&this.time-a.lastGround<.06
          ?a.speed>.5&&Math.hypot(input.x,input.z)>.05?'Walk':'Idle':a.vy>1?'Jump':'Fall';
        const p=a.body.translation();
        if((!Number.isFinite(p.y)||p.y<-100)&&!a.voidSent) {
          a.voidSent=true;
          this.events.push({id:a.id,name:'void'});
        }
      }
      this.world.step();
      this.parts.update(DT);
    }
  }

  snapshot(a) {
    const p=a.body.translation();
    const q=a.body.rotation();
    const v=a.velocity;

    return {
      p:[p.x,p.y,p.z],
      q:[q.x,q.y,q.z,q.w],
      v:[v.x,v.y,v.z],
      w:[0,0,0],
      state:a.state,
      speed:a.speed,
      ack:a.ack,
      revision:a.revision,
      grounded:a.grounded
    };
  }

  dispose() {
    this.world.free();
  }
}
