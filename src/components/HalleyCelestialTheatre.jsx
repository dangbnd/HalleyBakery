import { useEffect, useRef } from "react";
import * as THREE from "three";
import { candidatesFor } from "../utils/img.js";

const CARD_WIDTH = 4.5;
const CARD_HEIGHT = 4.5;
const VISIBLE_RADIUS = 3;

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const easeInOutCubic = (value) => {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

function normalizedIndex(index, count) {
  if (!count) return 0;
  return ((index % count) + count) % count;
}

function coverTexture(texture, targetAspect) {
  const image = texture.image;
  const imageAspect = image?.width && image?.height ? image.width / image.height : targetAspect;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);
  if (imageAspect > targetAspect) {
    texture.repeat.x = targetAspect / imageAspect;
    texture.offset.x = (1 - texture.repeat.x) / 2;
  } else {
    texture.repeat.y = imageAspect / targetAspect;
    texture.offset.y = (1 - texture.repeat.y) / 2;
  }
  texture.needsUpdate = true;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export default function HalleyCelestialTheatre({
  slides = [],
  currentFrame,
  pendingFrame,
  transitioning = false,
  direction = 1,
  transitionMs = 1800,
  reduceMotion = false,
}) {
  const mountRef = useRef(null);
  const runtimeRef = useRef(null);
  const propsRef = useRef({
    slides,
    currentFrame,
    pendingFrame,
    transitioning,
    direction,
    transitionMs,
    reduceMotion,
  });

  propsRef.current = {
    slides,
    currentFrame,
    pendingFrame,
    transitioning,
    direction,
    transitionMs,
    reduceMotion,
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !currentFrame || !slides.length) return undefined;

    let disposed = false;
    let animationFrame = 0;
    let resizeObserver = null;
    const textureCache = new Map();
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin("anonymous");

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x130d17);
    scene.fog = new THREE.FogExp2(0x130d17, 0.035);

    const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 80);
    camera.position.set(0, 0.12, 9.6);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch (error) {
      console.warn("[HalleyCelestialTheatre] WebGL unavailable; using image fallback.", error);
      return undefined;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.domElement.className = "halley-celestial-canvas";
    renderer.domElement.style.opacity = "0";
    mount.appendChild(renderer.domElement);

    const world = new THREE.Group();
    scene.add(world);

    const cardsGroup = new THREE.Group();
    world.add(cardsGroup);

    const orbitGroup = new THREE.Group();
    world.add(orbitGroup);

    const ambient = new THREE.HemisphereLight(0xfff2e4, 0x301421, 1.55);
    scene.add(ambient);

    const keyLight = new THREE.SpotLight(0xffd7bb, 54, 28, Math.PI / 5, 0.72, 1.2);
    keyLight.position.set(-5.5, 6.2, 7);
    keyLight.target.position.set(0, 0, 0);
    scene.add(keyLight, keyLight.target);

    const cyanLight = new THREE.PointLight(0x68c6db, 24, 22, 1.5);
    cyanLight.position.set(5.2, 1.6, 3.5);
    scene.add(cyanLight);

    const roseLight = new THREE.PointLight(0xd47b91, 20, 18, 1.6);
    roseLight.position.set(-4.8, -2.2, 2.2);
    scene.add(roseLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 24),
      new THREE.MeshStandardMaterial({
        color: 0x120d15,
        metalness: 0.52,
        roughness: 0.34,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.42;
    floor.position.z = -1.5;
    scene.add(floor);

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(3.3, 3.62, 0.18, 96),
      new THREE.MeshPhysicalMaterial({
        color: 0x241722,
        metalness: 0.72,
        roughness: 0.18,
        clearcoat: 0.9,
        clearcoatRoughness: 0.16,
      })
    );
    plinth.position.set(0, -2.28, -0.12);
    scene.add(plinth);

    const plinthRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.42, 0.024, 8, 128),
      new THREE.MeshBasicMaterial({
        color: 0x72cddd,
        transparent: true,
        opacity: 0.66,
      })
    );
    plinthRing.rotation.x = Math.PI / 2;
    plinthRing.position.set(0, -2.17, -0.12);
    scene.add(plinthRing);

    const portalGroup = new THREE.Group();
    portalGroup.position.z = -2.1;
    scene.add(portalGroup);
    [2.72, 3.28, 3.86].forEach((radius, index) => {
      const portal = new THREE.Mesh(
        new THREE.RingGeometry(radius, radius + 0.014, 160),
        new THREE.MeshBasicMaterial({
          color: index === 1 ? 0xd49a91 : 0x74cddd,
          transparent: true,
          opacity: index === 1 ? 0.22 : 0.34,
          side: THREE.DoubleSide,
        })
      );
      portal.scale.x = 1.12 + index * 0.06;
      portalGroup.add(portal);
    });

    const archMaterial = new THREE.MeshBasicMaterial({
      color: 0xc59386,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    });
    for (let index = 0; index < 4; index += 1) {
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(3.6 + index * 0.72, 0.012, 5, 128),
        archMaterial.clone()
      );
      arch.scale.x = 1.48;
      arch.position.z = -4.6 - index * 0.55;
      arch.rotation.z = index % 2 ? 0.035 : -0.035;
      orbitGroup.add(arch);
    }

    const orbitPoints = [];
    for (let index = 0; index <= 160; index += 1) {
      const angle = (index / 160) * Math.PI * 2;
      orbitPoints.push(
        new THREE.Vector3(
          Math.cos(angle) * 7.2,
          Math.sin(angle * 2) * 0.34,
          Math.sin(angle) * 3.4 - 2.1
        )
      );
    }
    const orbitLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(orbitPoints),
      new THREE.LineBasicMaterial({
        color: 0x73c8d9,
        transparent: true,
        opacity: 0.22,
      })
    );
    orbitGroup.add(orbitLine);

    const random = seededRandom(982451653);
    const starPositions = [];
    const starColors = [];
    const starPalette = [
      new THREE.Color(0xffe8d5),
      new THREE.Color(0x77cfe0),
      new THREE.Color(0xd98ba0),
    ];
    for (let index = 0; index < 260; index += 1) {
      const radius = 7 + random() * 17;
      const angle = random() * Math.PI * 2;
      starPositions.push(
        Math.cos(angle) * radius,
        (random() - 0.5) * 11,
        -4 - random() * 20
      );
      const color = starPalette[Math.floor(random() * starPalette.length)];
      starColors.push(color.r, color.g, color.b);
    }
    const starsGeometry = new THREE.BufferGeometry();
    starsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
    starsGeometry.setAttribute("color", new THREE.Float32BufferAttribute(starColors, 3));
    const stars = new THREE.Points(
      starsGeometry,
      new THREE.PointsMaterial({
        size: 0.035,
        vertexColors: true,
        transparent: true,
        opacity: 0.78,
        sizeAttenuation: true,
      })
    );
    scene.add(stars);

    const comet = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffd18a })
    );
    orbitGroup.add(comet);

    const cometTailGeometry = new THREE.BufferGeometry();
    const cometTailPositions = new Float32Array(18 * 3);
    cometTailGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(cometTailPositions, 3)
    );
    const cometTail = new THREE.Line(
      cometTailGeometry,
      new THREE.LineBasicMaterial({
        color: 0xe9a5a9,
        transparent: true,
        opacity: 0.58,
      })
    );
    orbitGroup.add(cometTail);

    function loadTexture(url) {
      if (!url) return Promise.resolve(null);
      if (textureCache.has(url)) return textureCache.get(url);
      const promise = new Promise((resolve) => {
        textureLoader.load(
          url,
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
            coverTexture(texture, CARD_WIDTH / CARD_HEIGHT);
            resolve(texture);
          },
          undefined,
          () => resolve(null)
        );
      });
      textureCache.set(url, promise);
      return promise;
    }

    function materialOpacity(group, opacity) {
      group.traverse((object) => {
        if (!object.isMesh || !object.material) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          material.transparent = true;
          const baseOpacity = material.userData.baseOpacity ?? material.opacity ?? 1;
          material.userData.baseOpacity = baseOpacity;
          material.opacity = baseOpacity * opacity;
        });
      });
    }

    function createPhotoMonolith(relative, slideIndex) {
      const group = new THREE.Group();
      group.userData.relative = relative;
      group.userData.slideIndex = slideIndex;

      const glowMaterial = new THREE.MeshBasicMaterial({
        color: relative === 0 ? 0x75d2df : 0xc78392,
        transparent: true,
        opacity: relative === 0 ? 0.2 : 0.08,
        side: THREE.DoubleSide,
      });
      glowMaterial.userData.baseOpacity = glowMaterial.opacity;
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(CARD_WIDTH + 0.62, CARD_HEIGHT + 0.62),
        glowMaterial
      );
      glow.position.z = -0.18;
      group.add(glow);

      const backingMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x261522,
        metalness: 0.46,
        roughness: 0.24,
        clearcoat: 0.82,
        clearcoatRoughness: 0.2,
        transparent: true,
        opacity: 0.98,
      });
      backingMaterial.userData.baseOpacity = 0.98;
      const backing = new THREE.Mesh(
        new THREE.BoxGeometry(CARD_WIDTH + 0.24, CARD_HEIGHT + 0.24, 0.22),
        backingMaterial
      );
      backing.position.z = -0.08;
      group.add(backing);

      const imageMaterial = new THREE.MeshBasicMaterial({
        color: 0x4b303e,
        transparent: true,
        opacity: 1,
        toneMapped: false,
      });
      imageMaterial.userData.baseOpacity = 1;
      const image = new THREE.Mesh(
        new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT),
        imageMaterial
      );
      image.position.z = 0.075;
      image.userData.imageMaterial = imageMaterial;
      group.userData.imageMesh = image;
      group.add(image);

      const railMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xc78f82,
        metalness: 0.68,
        roughness: 0.2,
        clearcoat: 0.7,
        transparent: true,
        opacity: 0.96,
      });
      railMaterial.userData.baseOpacity = 0.96;
      const horizontalGeometry = new THREE.BoxGeometry(CARD_WIDTH + 0.18, 0.075, 0.16);
      const verticalGeometry = new THREE.BoxGeometry(0.075, CARD_HEIGHT + 0.18, 0.16);
      const top = new THREE.Mesh(horizontalGeometry, railMaterial);
      const bottom = new THREE.Mesh(horizontalGeometry, railMaterial);
      const left = new THREE.Mesh(verticalGeometry, railMaterial);
      const right = new THREE.Mesh(verticalGeometry, railMaterial);
      top.position.set(0, CARD_HEIGHT / 2 + 0.08, 0.11);
      bottom.position.set(0, -CARD_HEIGHT / 2 - 0.08, 0.11);
      left.position.set(-CARD_WIDTH / 2 - 0.08, 0, 0.11);
      right.position.set(CARD_WIDTH / 2 + 0.08, 0, 0.11);
      group.add(top, bottom, left, right);

      return group;
    }

    function poseFor(relative, mobile) {
      const distance = Math.abs(relative);
      const spread = mobile ? 4.1 : 5.05;
      const x = Math.sign(relative) * spread * (1 - Math.exp(-distance * 0.72));
      const y = distance === 0 ? 0.18 : 0.2 + Math.min(distance, 3) * 0.1;
      const z = distance === 0 ? 0 : -1.18 - distance * 0.74;
      const scale =
        distance === 0 ? 0.98 : distance === 1 ? 0.64 : distance === 2 ? 0.43 : 0.3;
      const rotationY = relative === 0 ? 0 : -Math.sign(relative) * (0.46 + distance * 0.055);
      const opacity = distance <= 2 ? 0.94 : 0.28;
      return { x, y, z, scale, rotationY, opacity };
    }

    function applyPose(group, pose) {
      group.position.set(pose.x, pose.y, pose.z);
      group.rotation.set(0, pose.rotationY, 0);
      group.scale.setScalar(pose.scale);
      materialOpacity(group, pose.opacity);
    }

    function interpolatePose(group, from, to, progress) {
      group.position.set(
        THREE.MathUtils.lerp(from.x, to.x, progress),
        THREE.MathUtils.lerp(from.y, to.y, progress),
        THREE.MathUtils.lerp(from.z, to.z, progress)
      );
      group.rotation.y = THREE.MathUtils.lerp(from.rotationY, to.rotationY, progress);
      group.scale.setScalar(THREE.MathUtils.lerp(from.scale, to.scale, progress));
      materialOpacity(group, THREE.MathUtils.lerp(from.opacity, to.opacity, progress));
    }

    function thumbnailUrl(slide) {
      return candidatesFor(slide?.src || "", 520, 0, 60)[0] || slide?.src || "";
    }

    let buildToken = 0;
    function clearCards() {
      const geometries = new Set();
      const materials = new Set();
      cardsGroup.children.forEach((card) => {
        card.traverse((object) => {
          if (object.geometry) geometries.add(object.geometry);
          if (!object.material) return;
          const list = Array.isArray(object.material) ? object.material : [object.material];
          list.forEach((material) => materials.add(material));
        });
      });
      while (cardsGroup.children.length) cardsGroup.remove(cardsGroup.children[0]);
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    }

    async function buildCards(frame, allSlides) {
      if (!frame || !allSlides.length || disposed) return;
      const token = ++buildToken;
      const count = allSlides.length;
      const mobile = renderer.domElement.clientWidth / Math.max(renderer.domElement.clientHeight, 1) < 1.15;

      clearCards();

      const groups = [];
      for (let relative = -VISIBLE_RADIUS; relative <= VISIBLE_RADIUS; relative += 1) {
        const slideIndex = normalizedIndex(frame.index + relative, count);
        const slide = allSlides[slideIndex];
        const card = createPhotoMonolith(relative, slideIndex);
        applyPose(card, poseFor(relative, mobile));
        cardsGroup.add(card);
        groups.push(card);

        const url = relative === 0 ? frame.url : thumbnailUrl(slide);
        loadTexture(url).then((texture) => {
          if (!texture || disposed || token !== buildToken) return;
          const material = card.userData.imageMesh?.userData.imageMaterial;
          if (!material) return;
          material.map = texture;
          material.color.setHex(0xffffff);
          material.needsUpdate = true;
          if (relative === 0) {
            renderer.render(scene, camera);
            requestAnimationFrame(() => {
              if (!disposed) renderer.domElement.style.opacity = "1";
            });
          }
        });
      }

      runtimeRef.current.cards = groups;
      runtimeRef.current.mobile = mobile;
    }

    function startTransition(nextFrame, nextDirection, duration) {
      const runtime = runtimeRef.current;
      if (!runtime || !nextFrame || runtime.transition) return;
      const targetCard = runtime.cards.find(
        (card) => card.userData.relative === nextDirection
      );
      if (targetCard) {
        loadTexture(nextFrame.url).then((texture) => {
          if (!texture || disposed) return;
          const material = targetCard.userData.imageMesh?.userData.imageMaterial;
          if (!material) return;
          material.map = texture;
          material.color.setHex(0xffffff);
          material.needsUpdate = true;
        });
      }

      runtime.transition = {
        startedAt: performance.now(),
        direction: nextDirection,
        duration: Math.max(80, duration),
      };
    }

    const pointerTarget = { x: 0, y: 0 };
    const pointerLive = { x: 0, y: 0 };
    const frameElement = mount.closest(".hero-art-frame");
    const onPointerMove = (event) => {
      if (!frameElement) return;
      const rect = frameElement.getBoundingClientRect();
      pointerTarget.x = ((event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2;
      pointerTarget.y = ((event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 2;
    };
    const onPointerLeave = () => {
      pointerTarget.x = 0;
      pointerTarget.y = 0;
    };
    frameElement?.addEventListener("pointermove", onPointerMove, { passive: true });
    frameElement?.addEventListener("pointerleave", onPointerLeave);

    function resize() {
      const width = Math.max(1, Math.round(mount.clientWidth));
      const height = Math.max(1, Math.round(mount.clientHeight));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      const mobile = camera.aspect < 1.15;
      camera.position.z = mobile ? 10.8 : 9.6;
      camera.updateProjectionMatrix();
      if (runtimeRef.current && runtimeRef.current.mobile !== mobile) {
        const props = propsRef.current;
        buildCards(props.currentFrame, props.slides);
      }
    }

    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(mount);
    } else {
      window.addEventListener("resize", resize);
    }
    resize();

    runtimeRef.current = {
      renderer,
      scene,
      camera,
      world,
      cards: [],
      mobile: camera.aspect < 1.15,
      transition: null,
      buildCards,
      startTransition,
    };
    buildCards(currentFrame, slides);

    const startedAt = performance.now();
    function render(now) {
      if (disposed) return;
      const runtime = runtimeRef.current;
      const elapsed = (now - startedAt) / 1000;
      pointerLive.x = THREE.MathUtils.lerp(pointerLive.x, pointerTarget.x, 0.045);
      pointerLive.y = THREE.MathUtils.lerp(pointerLive.y, pointerTarget.y, 0.045);

      world.rotation.y = pointerLive.x * 0.045;
      world.rotation.x = -pointerLive.y * 0.026;
      cardsGroup.position.y = Math.sin(elapsed * 0.72) * 0.045;
      stars.rotation.y = elapsed * 0.0035;
      orbitGroup.rotation.z = Math.sin(elapsed * 0.18) * 0.008;
      portalGroup.rotation.z = elapsed * 0.018;

      const cometAngle = elapsed * 0.24;
      comet.position.set(
        Math.cos(cometAngle) * 7.2,
        Math.sin(cometAngle * 2) * 0.34,
        Math.sin(cometAngle) * 3.4 - 2.1
      );
      for (let index = 0; index < 18; index += 1) {
        const tailAngle = cometAngle - index * 0.018;
        cometTailPositions[index * 3] = Math.cos(tailAngle) * 7.2;
        cometTailPositions[index * 3 + 1] = Math.sin(tailAngle * 2) * 0.34;
        cometTailPositions[index * 3 + 2] = Math.sin(tailAngle) * 3.4 - 2.1;
      }
      cometTailGeometry.attributes.position.needsUpdate = true;

      if (runtime?.transition) {
        const transition = runtime.transition;
        const raw = clamp01((now - transition.startedAt) / transition.duration);
        const progress = reduceMotion ? 1 : easeInOutCubic(raw);
        runtime.cards.forEach((card) => {
          const relative = card.userData.relative;
          interpolatePose(
            card,
            poseFor(relative, runtime.mobile),
            poseFor(relative - transition.direction, runtime.mobile),
            progress
          );
        });
        const arc = Math.sin(raw * Math.PI);
        camera.position.x = transition.direction * arc * (runtime.mobile ? 0.38 : 0.92);
        camera.position.y = 0.12 + arc * 0.24;
        camera.position.z = (runtime.mobile ? 10.8 : 9.6) - arc * 0.68;
        orbitGroup.rotation.y = transition.direction * progress * 0.22;
        portalGroup.rotation.y = -transition.direction * progress * 0.12;
        if (raw >= 1) runtime.transition = null;
      } else {
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, 0, 0.06);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0.12, 0.06);
        camera.position.z = THREE.MathUtils.lerp(
          camera.position.z,
          runtime?.mobile ? 10.8 : 9.6,
          0.06
        );
        orbitGroup.rotation.y = THREE.MathUtils.lerp(orbitGroup.rotation.y, 0, 0.05);
        portalGroup.rotation.y = THREE.MathUtils.lerp(portalGroup.rotation.y, 0, 0.05);
      }

      camera.lookAt(0, 0, -0.1);
      camera.rotation.z = runtime?.transition
        ? -runtime.transition.direction *
          Math.sin(
            clamp01((now - runtime.transition.startedAt) / runtime.transition.duration) *
              Math.PI
          ) *
          0.012
        : THREE.MathUtils.lerp(camera.rotation.z, 0, 0.06);
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(render);
    }
    animationFrame = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener("resize", resize);
      frameElement?.removeEventListener("pointermove", onPointerMove);
      frameElement?.removeEventListener("pointerleave", onPointerLeave);
      runtimeRef.current = null;
      renderer.dispose();
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      textureCache.forEach((promise) => {
        promise.then((texture) => texture?.dispose());
      });
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || transitioning || !currentFrame) return;
    runtime.buildCards(currentFrame, slides);
  }, [currentFrame?.index, currentFrame?.url, slides, transitioning]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !transitioning || !pendingFrame) return;
    runtime.startTransition(
      pendingFrame,
      direction,
      reduceMotion ? 80 : transitionMs
    );
  }, [direction, pendingFrame, reduceMotion, transitionMs, transitioning]);

  return <div ref={mountRef} className="halley-celestial-scene" aria-hidden="true" />;
}
