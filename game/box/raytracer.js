// 使用IIFE（立即调用函数表达式）来封装，并暴露一个全局接口
(function() {
    // 确保在DOM加载后执行
    window.addEventListener('load', () => {

        // --- 初始设置 ---
        let moveSpeed = 0.5;
        let rotateSpeed = 0.05;
        let maxReflectionDepth = 3;

        const canvas = document.getElementById('raytracer-canvas');
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        const samplesCountUI = document.getElementById('samples-count');
        const renderTimeUI = document.getElementById('render-time');
        
        // (此处省略 Vec3, Ray, Material, Sphere, Light 类的代码, 与之前相同)
        class Vec3 { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z} add(v){return new Vec3(this.x+v.x,this.y+v.y,this.z+v.z)} sub(v){return new Vec3(this.x-v.x,this.y-v.y,this.z-v.z)} scale(s){return new Vec3(this.x*s,this.y*s,this.z*s)} dot(v){return this.x*v.x+this.y*v.y+this.z*v.z} cross(v){return new Vec3(this.y*v.z-this.z*v.y,this.z*v.x-this.x*v.z,this.x*v.y-this.y*v.x)} length(){return Math.sqrt(this.dot(this))} normalize(){const l=this.length();return l>1e-6?this.scale(1/l):new Vec3()}}
        class Ray { constructor(o,d){this.origin=o;this.direction=d.normalize()} }
        class Material { constructor(c, {ambient=0.1,diffuse=0.9,specular=0.3,shininess=200,reflection=0.2}={}){this.color=c;this.ambient=ambient;this.diffuse=diffuse;this.specular=specular;this.shininess=shininess;this.reflection=reflection} }
        class Sphere { constructor(c,r,m){this.center=c;this.radius=r;this.material=m} intersect(r){const oc=r.origin.sub(this.center);const a=r.direction.dot(r.direction);const b=2*oc.dot(r.direction);const c=oc.dot(oc)-this.radius*this.radius;const d=b*b-4*a*c;if(d<0)return null;else{const t1=(-b-Math.sqrt(d))/(2*a);const t2=(-b+Math.sqrt(d))/(2*a);if(t1>1e-4)return t1;if(t2>1e-4)return t2;return null}} }
        class Light { constructor(p,c,i){this.position=p;this.color=c;this.intensity=i} }

        // (此处省略 Camera 类的代码, 与之前相同)
        class Camera { constructor(o,t,f=60){this.origin=o;this.target=t;this.fov=f;this.worldUp=new Vec3(0,1,0);this.forward=new Vec3();this.right=new Vec3();this.up=new Vec3();this.updateBasis()} updateBasis(){this.forward=this.origin.sub(this.target).normalize();this.right=this.worldUp.cross(this.forward).normalize();this.up=this.forward.cross(this.right).normalize()} rotate(y,p){let d=this.target.sub(this.origin);if(y!==0){const c=Math.cos(y),s=Math.sin(y);d=new Vec3(d.x*c-d.z*s,d.y,d.x*s+d.z*c)}if(p!==0){const c=Math.cos(p),s=Math.sin(p);const r=this.right;const d_dot_r=d.dot(r);d=r.scale(d_dot_r*(1-c)).add(r.cross(d).scale(-s)).add(d.scale(c))}this.target=this.origin.add(d.normalize());this.updateBasis()} }

        // --- 场景定义 ---
        const camera = new Camera(new Vec3(0, 0, -5), new Vec3(0, 0, 0), 75);
        const scene = { /* ... 与之前相同 ... */ };
        scene.objects = [ new Sphere(new Vec3(0,-1,3),1,new Material(new Vec3(255,0,0),{reflection:0.3})), new Sphere(new Vec3(2,0,4),1,new Material(new Vec3(0,0,255),{reflection:0.4})), new Sphere(new Vec3(-2,0,4),1,new Material(new Vec3(0,255,0),{reflection:0.2})), new Sphere(new Vec3(0,-10001,0),10000,new Material(new Vec3(200,200,200),{reflection:0.5})) ];
        scene.lights = [ new Light(new Vec3(-10,10,-10),new Vec3(255,255,255),1.5), new Light(new Vec3(10,20,-10),new Vec3(255,255,255),1.0) ];
        scene.backgroundColor = new Vec3(15,15,15);

        // --- 核心追踪函数 (已修改，使用全局的反射深度) ---
        function trace(ray, scene, depth) {
            if (depth > maxReflectionDepth) return scene.backgroundColor; // 使用全局变量
            // ... 其余逻辑与之前相同
            let ct=Infinity,co=null;for(const o of scene.objects){const t=o.intersect(ray);if(t&&t<ct){ct=t;co=o}}if(!co)return scene.backgroundColor;const hp=ray.origin.add(ray.direction.scale(ct));const n=hp.sub(co.center).normalize();const vd=ray.direction.scale(-1).normalize();let fc=new Vec3();const m=co.material;let am=m.color.scale(m.ambient),di=new Vec3(),sp=new Vec3();for(const l of scene.lights){const ld=l.position.sub(hp).normalize();const sr=new Ray(hp,ld);let sh=false;for(const o of scene.objects){if(o!==co){const t=o.intersect(sr);if(t&&t<l.position.sub(hp).length()){sh=true;break}}}if(!sh){const diff=Math.max(0,n.dot(ld));di=di.add(m.color.scale(diff*m.diffuse).scale(l.intensity));const rd=ld.scale(-1).sub(n.scale(2*n.dot(ld.scale(-1)))).normalize();const spec=Math.pow(Math.max(0,vd.dot(rd)),m.shininess);sp=sp.add(l.color.scale(spec*m.specular).scale(l.intensity))}}fc=am.add(di).add(sp);if(m.reflection>0){const rd=ray.direction.sub(n.scale(2*n.dot(ray.direction)));const rr=new Ray(hp,rd);const rc=trace(rr,scene,depth+1);fc=fc.scale(1-m.reflection).add(rc.scale(m.reflection))}return fc
        }

        // --- 渐进式渲染逻辑 (与之前相同) ---
        let cameraMoved = true;
        let sampleCount = 0;
        const accumulationBuffer = new Float32Array(width * height * 3);
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;
        
        function resetAccumulation() { /* ...与之前相同... */ cameraMoved = false; sampleCount = 0; accumulationBuffer.fill(0); camera.updateBasis(); }
        function progressiveRenderLoop() { /* ...与之前相同... */ const s=performance.now();if(cameraMoved)resetAccumulation();sampleCount++;const a=width/height,iw=1/width,ih=1/height,an=Math.tan(Math.PI*.5*camera.fov/180);for(let y=0;y<height;y++){for(let x=0;x<width;x++){const Px=(2*((x+Math.random())*iw)-1)*an*a;const Py=(1-2*((y+Math.random())*ih))*an;const rd=camera.right.scale(Px).add(camera.up.scale(Py)).sub(camera.forward).normalize();const r=new Ray(camera.origin,rd);const c=trace(r,scene,0);const bi=(y*width+x)*3;accumulationBuffer[bi]+=c.x;accumulationBuffer[bi+1]+=c.y;accumulationBuffer[bi+2]+=c.z;const ar=accumulationBuffer[bi]/sampleCount,ag=accumulationBuffer[bi+1]/sampleCount,ab=accumulationBuffer[bi+2]/sampleCount;const di=(y*width+x)*4;data[di]=Math.min(255,ar);data[di+1]=Math.min(255,ag);data[di+2]=Math.min(255,ab);data[di+3]=255}}ctx.putImageData(imageData,0,0);const e=performance.now();samplesCountUI.textContent=`Samples: ${sampleCount}`;renderTimeUI.textContent=`Time: ${(e-s).toFixed(2)}ms`;requestAnimationFrame(progressiveRenderLoop)}

        // --- 事件处理 (使用可配置的速度变量) ---
        function handleKeyDown(event) {
            let needsReset = true;
            const forwardVec = camera.target.sub(camera.origin).normalize();
            switch (event.key) {
                case 'w': case 'W': const mf=forwardVec.scale(moveSpeed);camera.origin=camera.origin.add(mf);camera.target=camera.target.add(mf);break;
                case 's': case 'S': const mb=forwardVec.scale(-moveSpeed);camera.origin=camera.origin.add(mb);camera.target=camera.target.add(mb);break;
                case 'a': case 'A': const ml=camera.right.scale(moveSpeed);camera.origin=camera.origin.add(ml);camera.target=camera.target.add(ml);break;
                case 'd': case 'D': const mr=camera.right.scale(-moveSpeed);camera.origin=camera.origin.add(mr);camera.target=camera.target.add(mr);break;
                case ' ': const mu=new Vec3(0,moveSpeed,0);camera.origin=camera.origin.add(mu);camera.target=camera.target.add(mu);break;
                case 'Shift': const md=new Vec3(0,-moveSpeed,0);camera.origin=camera.origin.add(md);camera.target=camera.target.add(md);break;
                case 'ArrowLeft': camera.rotate(rotateSpeed,0);break;
                case 'ArrowRight': camera.rotate(-rotateSpeed,0);break;
                case 'ArrowUp': camera.rotate(0,rotateSpeed);break;
                case 'ArrowDown': camera.rotate(0,-rotateSpeed);break;
                default: needsReset=false;
            }
            if (needsReset) cameraMoved = true;
        }
        document.addEventListener('keydown', handleKeyDown);

        // --- 暴露给外部UI脚本的公共接口 ---
        window.engine = {
            setFov: (value) => { if (camera.fov !== value) { camera.fov = value; cameraMoved = true; }},
            getFov: () => camera.fov,
            setMaxReflections: (value) => { if (maxReflectionDepth !== value) { maxReflectionDepth = value; cameraMoved = true; }},
            getMaxReflections: () => maxReflectionDepth,
            setSpeed: (value) => { moveSpeed = value; },
            getSpeed: () => moveSpeed,
            setRotateSpeed: (value) => { rotateSpeed = value; },
            getRotateSpeed: () => rotateSpeed,
        };

        // 启动主渲染循环
        progressiveRenderLoop();
    });
})();