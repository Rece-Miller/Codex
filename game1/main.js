import * as THREE from 'https://unpkg.com/three@0.166.1/build/three.module.js';

const canvas = document.querySelector('#game');
const progressEl = document.querySelector('#progress');
const objectiveEl = document.querySelector('#objective');
const statusEl = document.querySelector('#status');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#bfe4ff');
scene.fog = new THREE.Fog('#bfe4ff', 35, 130);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 250);

const hemiLight = new THREE.HemisphereLight('#ffffff', '#76a86d', 2.2);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight('#fff3d8', 2.7);
sun.position.set(25, 40, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 180;
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
scene.add(sun);

const ambientCloud = new THREE.Group();
scene.add(ambientCloud);

function addCloud(x, y, z, scale) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.88 });
  const parts = [
    [-1.1, 0, 0, 1.2],
    [0, 0.25, 0.25, 1.4],
    [1.15, 0, -0.1, 1.05],
    [0.3, -0.1, -0.8, 0.95]
  ];

  for (const part of parts) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(part[3], 18, 18), material);
    puff.position.set(part[0], part[1], part[2]);
    group.add(puff);
  }

  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  ambientCloud.add(group);
}

addCloud(-32, 24, -20, 1.5);
addCloud(8, 28, -38, 1.8);
addCloud(34, 32, 8, 1.65);
addCloud(-12, 26, 30, 1.35);

const colliders = [];
const movingPlatforms = [];
const hazards = [];
const jumpPads = [];
const checkpoints = [];
const collectibles = [];
const obstacleColliders = [];
const worldUp = new THREE.Vector3(0, 1, 0);
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const moveInput = new THREE.Vector3();
const desiredVelocity = new THREE.Vector3();
const bobOffset = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const collisionPush = new THREE.Vector3();
const clock = new THREE.Clock();
const keys = new Set();

const player = {
  position: new THREE.Vector3(0, 2, 21),
  spawn: new THREE.Vector3(0, 2, 21),
  height: 1.62,
  radius: 0.42,
  speed: 8.6,
  jumpVelocity: 11.2,
  gravity: 24,
  verticalVelocity: 0,
  grounded: false,
  bobTime: 0,
  support: null,
  won: false,
  checkpointName: 'Start Pad'
};

let yaw = Math.PI;
let pitch = -0.08;
let pointerLocked = false;
let collectedCount = 0;
let statusMessage = 'Checkpoint: Start Pad';
let portalOpen = false;

const shadowPlayer = new THREE.Group();
scene.add(shadowPlayer);

const shadowMaterial = new THREE.MeshStandardMaterial({ color: '#ff8a3d' });
shadowMaterial.colorWrite = false;
shadowMaterial.depthWrite = false;

const shadowBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.05, 6, 12), shadowMaterial);
shadowBody.position.y = 1.02;
shadowBody.castShadow = true;
shadowPlayer.add(shadowBody);

const shadowHead = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 20), shadowMaterial);
shadowHead.position.y = 1.9;
shadowHead.castShadow = true;
shadowPlayer.add(shadowHead);

function addPlatform(config) {
  const geometry = new THREE.BoxGeometry(config.size.x, config.size.y, config.size.z);
  const material = new THREE.MeshStandardMaterial({
    color: config.color || '#6d8594',
    roughness: config.roughness ?? 0.82,
    metalness: config.metalness ?? 0.08,
    emissive: config.emissive || '#000000',
    emissiveIntensity: config.emissiveIntensity ?? 0
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(config.position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: config.edgeColor || '#31414c' })
  );
  edge.position.copy(config.position);
  scene.add(edge);

  const collider = {
    mesh,
    edge,
    size: config.size.clone(),
    basePosition: config.position.clone(),
    lastPosition: config.position.clone(),
    delta: new THREE.Vector3(),
    moving: Boolean(config.moving),
    motionAxis: config.motionAxis ? config.motionAxis.clone() : new THREE.Vector3(),
    amplitude: config.amplitude || 0,
    speed: config.speed || 0,
    phase: config.phase || 0,
    name: config.name || 'Platform'
  };

  colliders.push(collider);

  if (collider.moving) {
    movingPlatforms.push(collider);
  }

  return collider;
}

function addHazard(position, size) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshStandardMaterial({
      color: '#ff5b5b',
      emissive: '#ff3b3b',
      emissiveIntensity: 0.38,
      roughness: 0.35
    })
  );
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  hazards.push({ mesh, size: size.clone() });
}

function addCylinderObstacle(position, height, radius) {
  obstacleColliders.push({
    type: 'cylinder',
    position: position.clone(),
    height,
    radius
  });
}

function addJumpPad(position, size, boost) {
  const collider = addPlatform({
    name: 'Jump Pad',
    position,
    size,
    color: '#1f6f80',
    edgeColor: '#90f7ff',
    emissive: '#57f1ff',
    emissiveIntensity: 0.28,
    roughness: 0.42
  });

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(Math.max(size.x, size.z) * 0.2, 0.08, 12, 40),
    new THREE.MeshStandardMaterial({ color: '#d9fbff', emissive: '#8ef4ff', emissiveIntensity: 0.6 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(position);
  ring.position.y += size.y / 2 + 0.08;
  scene.add(ring);

  jumpPads.push({ collider, ring, boost });
}

function addCheckpoint(name, position) {
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 2.6, 12),
    new THREE.MeshStandardMaterial({ color: '#f4f7ff', metalness: 0.2, roughness: 0.35 })
  );
  pole.position.copy(position);
  pole.position.y += 1.3;
  pole.castShadow = true;
  scene.add(pole);

  const flag = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.5, 0.08),
    new THREE.MeshStandardMaterial({ color: '#ffd866', emissive: '#ffec99', emissiveIntensity: 0.2 })
  );
  flag.position.copy(position);
  flag.position.set(position.x + 0.45, position.y + 2, position.z);
  scene.add(flag);

  checkpoints.push({ name, position: position.clone(), pole, flag, active: false });
}

function addCollectible(position, color) {
  const group = new THREE.Group();
  group.position.copy(position);

  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.5, 0),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.55,
      roughness: 0.25,
      metalness: 0.1
    })
  );
  core.castShadow = true;
  group.add(core);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.8, 0.05, 10, 28),
    new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.16 })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  scene.add(group);
  collectibles.push({ group, ring, collected: false, baseY: position.y, radius: 1.05 });
}

function addColumn(position, height, radius, color) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.15, height, 18),
    new THREE.MeshStandardMaterial({ color, roughness: 0.88 })
  );
  mesh.position.copy(position);
  mesh.position.y += height / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  addCylinderObstacle(mesh.position, height, radius);
}

function addArch(position, width, height, depth) {
  addPlatform({ position: new THREE.Vector3(position.x - width / 2 + 0.5, position.y + height / 2, position.z), size: new THREE.Vector3(1, height, depth), color: '#b98d61', edgeColor: '#6a4d32' });
  addPlatform({ position: new THREE.Vector3(position.x + width / 2 - 0.5, position.y + height / 2, position.z), size: new THREE.Vector3(1, height, depth), color: '#b98d61', edgeColor: '#6a4d32' });
  addPlatform({ position: new THREE.Vector3(position.x, position.y + height - 0.5, position.z), size: new THREE.Vector3(width, 1, depth), color: '#c79a6c', edgeColor: '#6a4d32' });
}

addPlatform({
  name: 'Ground',
  position: new THREE.Vector3(0, -0.5, 0),
  size: new THREE.Vector3(60, 1, 60),
  color: '#63be6a',
  edgeColor: '#3a7f45',
  roughness: 0.94
});

addPlatform({ name: 'Start Ledge', position: new THREE.Vector3(0, 1, 18), size: new THREE.Vector3(12, 2, 12), color: '#7b8fa3' });
addPlatform({ name: 'Step One', position: new THREE.Vector3(-8, 2.5, 10), size: new THREE.Vector3(5, 3, 5), color: '#8ea0b2' });
addPlatform({ name: 'Step Two', position: new THREE.Vector3(-14, 5, 2), size: new THREE.Vector3(4, 2, 4), color: '#8ea0b2' });
addPlatform({ name: 'Beam', position: new THREE.Vector3(-18, 7.5, -7), size: new THREE.Vector3(3, 1, 12), color: '#7f91a5' });
addPlatform({ name: 'Moving Bridge A', position: new THREE.Vector3(-18, 10, -18), size: new THREE.Vector3(6, 1, 6), color: '#5d7387', moving: true, motionAxis: new THREE.Vector3(1, 0, 0), amplitude: 6, speed: 1.1, phase: 0.5 });
addJumpPad(new THREE.Vector3(-6, 12.5, -24), new THREE.Vector3(6, 1, 6), 18.4);
addPlatform({ name: 'High Deck', position: new THREE.Vector3(10, 18, -24), size: new THREE.Vector3(14, 1, 14), color: '#a0845c', edgeColor: '#5b4731' });
addHazard(new THREE.Vector3(10, 18.65, -24), new THREE.Vector3(4, 0.3, 4));
addPlatform({ name: 'Pillar One', position: new THREE.Vector3(19, 20, -17), size: new THREE.Vector3(5, 1, 5), color: '#7f91a5' });
addPlatform({ name: 'Pillar Two', position: new THREE.Vector3(25, 22.5, -10), size: new THREE.Vector3(5, 1, 5), color: '#7f91a5' });
addPlatform({ name: 'Pillar Three', position: new THREE.Vector3(20, 25, -1), size: new THREE.Vector3(5, 1, 5), color: '#7f91a5' });
addPlatform({ name: 'Ramp Landing', position: new THREE.Vector3(13, 26.5, 8), size: new THREE.Vector3(11, 1, 9), color: '#9b7a54', edgeColor: '#5b4731' });
addPlatform({ name: 'Moving Bridge B', position: new THREE.Vector3(2, 28, 16), size: new THREE.Vector3(8, 1, 8), color: '#5d7387', moving: true, motionAxis: new THREE.Vector3(0, 0, 1), amplitude: 7, speed: 1.15, phase: 1.2 });
addJumpPad(new THREE.Vector3(-8, 30.5, 15), new THREE.Vector3(7, 1, 7), 16.4);
addPlatform({ name: 'Tower Deck', position: new THREE.Vector3(-12, 33, 2), size: new THREE.Vector3(12, 1, 12), color: '#8c6f4f', edgeColor: '#5b4731' });
addPlatform({ name: 'Spine One', position: new THREE.Vector3(-4, 34, -8), size: new THREE.Vector3(6, 1, 6), color: '#7f91a5' });
addPlatform({ name: 'Spine Two', position: new THREE.Vector3(4, 36.5, -16), size: new THREE.Vector3(6, 1, 6), color: '#7f91a5' });
addPlatform({ name: 'Spine Three', position: new THREE.Vector3(12, 39, -8), size: new THREE.Vector3(6, 1, 6), color: '#7f91a5' });
addPlatform({ name: 'Final Runway', position: new THREE.Vector3(18, 41, 4), size: new THREE.Vector3(11, 1, 15), color: '#a0845c', edgeColor: '#5b4731' });
addPlatform({ name: 'Summit', position: new THREE.Vector3(0, 42.5, 0), size: new THREE.Vector3(22, 1, 22), color: '#d5c3a1', edgeColor: '#7f6f55' });

addCheckpoint('Start Pad', new THREE.Vector3(0, 1.1, 21));
addCheckpoint('High Deck', new THREE.Vector3(10, 18.6, -18));
addCheckpoint('Tower Deck', new THREE.Vector3(-12, 33.6, 7));

addCollectible(new THREE.Vector3(-8, 5, 10), '#ff7b72');
addCollectible(new THREE.Vector3(-18, 9.5, -7), '#ffd866');
addCollectible(new THREE.Vector3(-18, 12.1, -18), '#66d9ef');
addCollectible(new THREE.Vector3(-6, 14.1, -24), '#7afcff');
addCollectible(new THREE.Vector3(22, 22.8, -15), '#a6e22e');
addCollectible(new THREE.Vector3(24, 28.8, 4), '#ff9ff3');
addCollectible(new THREE.Vector3(-12, 35.1, 2), '#ffd1dc');
addCollectible(new THREE.Vector3(18, 42.8, 4), '#c4b5fd');

addColumn(new THREE.Vector3(-25, 0, -28), 10, 1.5, '#96abc0');
addColumn(new THREE.Vector3(26, 0, -26), 12, 1.6, '#96abc0');
addColumn(new THREE.Vector3(30, 0, 24), 8, 1.4, '#96abc0');
addColumn(new THREE.Vector3(-28, 0, 20), 9, 1.5, '#96abc0');
addArch(new THREE.Vector3(0, 0, 8), 10, 7, 2);
addArch(new THREE.Vector3(18, 18, -24), 12, 9, 2);
addArch(new THREE.Vector3(0, 42.5, -10), 12, 8, 2);

const portalGroup = new THREE.Group();
portalGroup.position.set(0, 43.9, 0);
portalGroup.visible = false;
scene.add(portalGroup);

const portalRing = new THREE.Mesh(
  new THREE.TorusGeometry(2.4, 0.28, 20, 64),
  new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#8ef4ff', emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.25 })
);
portalRing.rotation.x = Math.PI / 2;
portalGroup.add(portalRing);

const portalCore = new THREE.Mesh(
  new THREE.CylinderGeometry(1.85, 1.85, 0.4, 28),
  new THREE.MeshStandardMaterial({ color: '#8ef4ff', emissive: '#79dfff', emissiveIntensity: 1.35, transparent: true, opacity: 0.86 })
);
portalCore.rotation.x = Math.PI / 2;
portalGroup.add(portalCore);

function updateHud() {
  progressEl.textContent = collectedCount + ' / ' + collectibles.length;
  statusEl.textContent = statusMessage;

  if (player.won) {
    objectiveEl.textContent = 'Portal reached. You cleared the whole parkour tower.';
    return;
  }

  if (portalOpen) {
    objectiveEl.textContent = 'All cores collected. Reach the summit portal.';
    return;
  }

  objectiveEl.textContent = 'Collect every core, ride the moving platforms, and reach the portal at the summit.';
}

function setStatus(message) {
  statusMessage = message;
  updateHud();
}

function updatePortalState() {
  portalOpen = collectedCount === collectibles.length;
  portalGroup.visible = portalOpen;
  updateHud();
}

function respawnPlayer(reason) {
  player.position.copy(player.spawn);
  player.verticalVelocity = 0;
  player.grounded = false;
  player.support = null;
  shadowPlayer.position.copy(player.position);
  setStatus(reason + ' Respawned at ' + player.checkpointName + '.');
}

function activateCheckpoint(checkpoint) {
  if (player.checkpointName === checkpoint.name) return;

  player.checkpointName = checkpoint.name;
  player.spawn.set(checkpoint.position.x, checkpoint.position.y + 0.4, checkpoint.position.z);
  setStatus('Checkpoint reached: ' + checkpoint.name);

  for (const point of checkpoints) {
    point.active = point === checkpoint;
    point.flag.material.emissiveIntensity = point.active ? 0.65 : 0.2;
    point.flag.material.color.set(point.active ? '#8ef4ff' : '#ffd866');
  }
}

function updateMovingPlatforms(elapsedTime) {
  for (const platform of movingPlatforms) {
    platform.lastPosition.copy(platform.mesh.position);
    const offset = Math.sin(elapsedTime * platform.speed + platform.phase) * platform.amplitude;
    platform.mesh.position.copy(platform.basePosition).addScaledVector(platform.motionAxis, offset);
    platform.edge.position.copy(platform.mesh.position);
    platform.delta.copy(platform.mesh.position).sub(platform.lastPosition);
  }
}

function colliderTop(platform) {
  return platform.mesh.position.y + platform.size.y / 2;
}

function colliderBottom(platform) {
  return platform.mesh.position.y - platform.size.y / 2;
}

function pointOnPlatformXZ(position, radius, platform) {
  return (
    Math.abs(position.x - platform.mesh.position.x) <= platform.size.x / 2 + radius * 0.6 &&
    Math.abs(position.z - platform.mesh.position.z) <= platform.size.z / 2 + radius * 0.6
  );
}

function overlapsVertical(minA, maxA, minB, maxB) {
  return maxA > minB && minA < maxB;
}

function resolveBoxSideCollision(platform) {
  if (platform.name === 'Ground') return;

  const feet = player.position.y;
  const head = feet + player.height;
  const bottom = colliderBottom(platform);
  const top = colliderTop(platform);

  if (!overlapsVertical(feet + 0.05, head - 0.1, bottom, top - 0.02)) return;

  const halfX = platform.size.x / 2 + player.radius;
  const halfZ = platform.size.z / 2 + player.radius;
  const dx = player.position.x - platform.mesh.position.x;
  const dz = player.position.z - platform.mesh.position.z;

  if (Math.abs(dx) >= halfX || Math.abs(dz) >= halfZ) return;

  const overlapX = halfX - Math.abs(dx);
  const overlapZ = halfZ - Math.abs(dz);

  if (overlapX < overlapZ) {
    player.position.x += dx >= 0 ? overlapX : -overlapX;
  } else {
    player.position.z += dz >= 0 ? overlapZ : -overlapZ;
  }
}

function resolveCylinderCollision(obstacle) {
  const feet = player.position.y;
  const head = feet + player.height;
  const bottom = obstacle.position.y - obstacle.height / 2;
  const top = obstacle.position.y + obstacle.height / 2;

  if (!overlapsVertical(feet + 0.05, head - 0.1, bottom, top)) return;

  collisionPush.set(
    player.position.x - obstacle.position.x,
    0,
    player.position.z - obstacle.position.z
  );

  const minDistance = obstacle.radius + player.radius;
  const currentDistance = collisionPush.length();

  if (currentDistance === 0) {
    collisionPush.set(1, 0, 0);
  } else if (currentDistance >= minDistance) {
    return;
  }

  collisionPush.normalize().multiplyScalar(minDistance - Math.max(currentDistance, 0.0001));
  player.position.x += collisionPush.x;
  player.position.z += collisionPush.z;
}

function resolveHorizontalCollisions() {
  for (const platform of colliders) {
    resolveBoxSideCollision(platform);
  }

  for (const obstacle of obstacleColliders) {
    if (obstacle.type === 'cylinder') {
      resolveCylinderCollision(obstacle);
    }
  }
}

function updateMovement(delta) {
  moveInput.set(0, 0, 0);
  if (keys.has('KeyW')) moveInput.z += 1;
  if (keys.has('KeyS')) moveInput.z -= 1;
  if (keys.has('KeyA')) moveInput.x += 1;
  if (keys.has('KeyD')) moveInput.x -= 1;

  if (player.support && player.grounded) {
    player.position.add(player.support.delta);
  }

  forward.set(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
  right.crossVectors(worldUp, forward).normalize();

  if (moveInput.lengthSq() > 0) {
    moveInput.normalize();
    desiredVelocity.copy(forward).multiplyScalar(moveInput.z).addScaledVector(right, moveInput.x).normalize();
    player.position.addScaledVector(desiredVelocity, player.speed * delta);
    shadowPlayer.rotation.y = Math.atan2(desiredVelocity.x, desiredVelocity.z);
    player.bobTime += delta * 10;
  } else {
    player.bobTime = 0;
  }

  resolveHorizontalCollisions();

  const previousFeet = player.position.y;
  player.verticalVelocity -= player.gravity * delta;
  player.position.y += player.verticalVelocity * delta;
  player.grounded = false;
  player.support = null;

  let bestPlatform = null;
  let bestTop = -Infinity;
  const landingSnapMargin = Math.max(0.08, Math.min(0.22, Math.abs(player.verticalVelocity) * delta + 0.03));

  for (const platform of colliders) {
    const top = colliderTop(platform);
    if (!pointOnPlatformXZ(player.position, player.radius, platform)) continue;
    if (previousFeet + 0.02 < top) continue;
    if (player.position.y > top + landingSnapMargin) continue;
    if (player.verticalVelocity > 0) continue;
    if (top > bestTop) {
      bestTop = top;
      bestPlatform = platform;
    }
  }

  if (bestPlatform) {
    player.position.y = bestTop;
    player.verticalVelocity = 0;
    player.grounded = true;
    player.support = bestPlatform;
  }

  for (const pad of jumpPads) {
    const top = colliderTop(pad.collider);
    if (!pointOnPlatformXZ(player.position, player.radius, pad.collider)) continue;
    if (Math.abs(player.position.y - top) > 0.02) continue;
    if (player.verticalVelocity === 0) {
      player.verticalVelocity = pad.boost;
      player.grounded = false;
      player.support = null;
      setStatus('Launch pad fired.');
    }
  }

  shadowPlayer.position.copy(player.position);
}

function updateCheckpoints() {
  for (const checkpoint of checkpoints) {
    const dx = player.position.x - checkpoint.position.x;
    const dz = player.position.z - checkpoint.position.z;
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
    const verticalDistance = Math.abs(player.position.y - checkpoint.position.y);
    if (horizontalDistance < 2.2 && verticalDistance < 1.8) {
      activateCheckpoint(checkpoint);
    }
  }
}

function updateHazards() {
  for (const hazard of hazards) {
    const halfX = hazard.size.x / 2 + player.radius * 0.5;
    const halfZ = hazard.size.z / 2 + player.radius * 0.5;
    const top = hazard.mesh.position.y + hazard.size.y / 2;
    if (
      Math.abs(player.position.x - hazard.mesh.position.x) <= halfX &&
      Math.abs(player.position.z - hazard.mesh.position.z) <= halfZ &&
      Math.abs(player.position.y - top) < 1.1
    ) {
      respawnPlayer('Hazard touched.');
      return;
    }
  }

  if (player.position.y < -12) {
    respawnPlayer('You fell.');
  }
}

function updateCollectibles(elapsedTime) {
  for (const [index, item] of collectibles.entries()) {
    if (item.collected) continue;

    item.group.position.y = item.baseY + Math.sin(elapsedTime * 2.4 + index * 0.7) * 0.22;
    item.group.rotation.y += 0.018;
    item.ring.rotation.z += 0.012;

    if (item.group.position.distanceTo(camera.position) < item.radius) {
      item.collected = true;
      item.group.visible = false;
      collectedCount += 1;
      setStatus('Core collected: ' + collectedCount + ' / ' + collectibles.length);
      updatePortalState();
    }
  }
}

function updatePortal(elapsedTime) {
  if (!portalOpen || player.won) return;

  portalRing.rotation.z += 0.01;
  portalCore.material.emissiveIntensity = 1.1 + Math.sin(elapsedTime * 3) * 0.25;

  if (portalGroup.position.distanceTo(camera.position) < 2.8) {
    player.won = true;
    setStatus('Portal reached. Course complete.');
    updateHud();
  }
}

function updateCamera() {
  const bobAmount = moveInput.lengthSq() > 0 && player.grounded ? Math.sin(player.bobTime) * 0.045 : 0;
  bobOffset.set(0, player.height + bobAmount, 0);
  camera.position.copy(player.position).add(bobOffset);

  lookTarget.set(
    player.position.x + Math.sin(yaw) * Math.cos(pitch),
    camera.position.y + Math.sin(pitch),
    player.position.z + Math.cos(yaw) * Math.cos(pitch)
  );
  camera.lookAt(lookTarget);
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);
  const elapsedTime = clock.elapsedTime;

  updateMovingPlatforms(elapsedTime);
  updateMovement(delta);
  updateCheckpoints();
  updateHazards();
  updateCollectibles(elapsedTime);
  updatePortal(elapsedTime);
  updateCamera();

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

document.addEventListener('keydown', (event) => {
  keys.add(event.code);

  if (event.code === 'Space' && player.grounded && !player.won) {
    player.verticalVelocity = player.jumpVelocity;
    player.grounded = false;
    player.support = null;
  }
});

document.addEventListener('keyup', (event) => {
  keys.delete(event.code);
});

canvas.addEventListener('click', async () => {
  if (!pointerLocked) {
    try {
      await canvas.requestPointerLock({ unadjustedMovement: true });
    } catch {
      canvas.requestPointerLock();
    }
  }
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
});

document.addEventListener('mousemove', (event) => {
  if (!pointerLocked) return;

  yaw -= event.movementX * 0.0025;
  pitch -= event.movementY * 0.002;
  pitch = THREE.MathUtils.clamp(pitch, -1.2, 1.2);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

checkpoints[0].active = true;
checkpoints[0].flag.material.emissiveIntensity = 0.65;
checkpoints[0].flag.material.color.set('#8ef4ff');
updatePortalState();
updateHud();
updateCamera();
shadowPlayer.position.copy(player.position);
animate();
