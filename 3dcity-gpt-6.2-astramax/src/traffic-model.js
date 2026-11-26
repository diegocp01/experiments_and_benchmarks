import { random } from './layout.js';

function makeLane(edge, from, to, dx, dz, index) {
  const offset = edge.width * 0.235;
  const x0 = from.x + dx * from.turnRadius - dz * offset,
    z0 = from.z + dz * from.turnRadius + dx * offset;
  const x1 = to.x - dx * to.turnRadius - dz * offset,
    z1 = to.z - dz * to.turnRadius + dx * offset;
  return { from, to, dx, dz, x0, z0, x1, z1, index, length: Math.hypot(x1 - x0, z1 - z0), cars: new Set() };
}
function turnBetween(a, b) {
  const x0 = a.x1,
    z0 = a.z1,
    x1 = b.x0,
    z1 = b.z0;
  const straight = a.dx === b.dx && a.dz === b.dz;
  const along = (x1 - x0) * a.dx + (z1 - z0) * a.dz;
  const cx = straight ? (x0 + x1) / 2 : x0 + a.dx * along,
    cz = straight ? (z0 + z1) / 2 : z0 + a.dz * along;
  let length = 0,
    px = x0,
    pz = z0;
  for (let i = 1; i <= 8; i++) {
    const u = i / 8,
      v = 1 - u,
      x = v * v * x0 + 2 * u * v * cx + u * u * x1,
      z = v * v * z0 + 2 * u * v * cz + u * u * z1;
    length += Math.hypot(x - px, z - pz);
    px = x;
    pz = z;
  }
  return { x0, z0, x1, z1, cx, cz, length, straight };
}
function pose(car) {
  if (!car.turn) {
    const l = car.lane;
    car.x = l.x0 + l.dx * car.s;
    car.z = l.z0 + l.dz * car.s;
    car.yaw = Math.atan2(l.dx, l.dz);
    return;
  }
  const { x0, z0, x1, z1, cx, cz, length } = car.turn,
    u = car.s / length,
    v = 1 - u;
  car.x = v * v * x0 + 2 * v * u * cx + u * u * x1;
  car.z = v * v * z0 + 2 * v * u * cz + u * u * z1;
  car.yaw = Math.atan2(v * (cx - x0) + u * (x1 - cx), v * (cz - z0) + u * (z1 - cz));
}
export class Traffic {
  constructor(city) {
    this.lanes = [];
    this.cars = [];
    this.owners = new Map();
    this.exits = new Map();
    for (const edge of city.edges) {
      const lanes = [
        makeLane(edge, edge.a, edge.b, edge.dx, edge.dz, this.lanes.length),
        makeLane(edge, edge.b, edge.a, -edge.dx, -edge.dz, this.lanes.length + 1),
      ];
      for (const lane of lanes) {
        this.lanes.push(lane);
        if (!this.exits.has(lane.from)) this.exits.set(lane.from, []);
        this.exits.get(lane.from).push(lane);
      }
    }
    const r = random(city.seed + '/traffic'),
      available = [...this.lanes];
    for (let i = 0; i < city.carCount; i++) {
      const pick = r.int(0, available.length - 1),
        lane = available[pick];
      available[pick] = available.at(-1);
      available.pop();
      const cruise = r.between(5.5, 10.0);
      const car = {
        lane,
        s: r.between(1, lane.length - 1),
        next: null,
        turn: null,
        cruise,
        speed: cruise,
        length: r.between(3.55, 4.85),
        width: r.between(1.65, 1.97),
        height: r.between(1.33, 1.65),
        random: random(city.seed + '/driver/' + i),
        turnCount: 0,
      };
      lane.cars.add(car);
      this.cars.push(car);
      pose(car);
    }
  }
  chooseNext(car) {
    const lane = car.lane,
      choices = this.exits.get(lane.to).filter((l) => l.to !== lane.from);
    const straight = choices.find((l) => l.dx === lane.dx && l.dz === lane.dz);
    return straight && car.random() < 0.56 ? straight : car.random.pick(choices);
  }
  step(dt) {
    for (const c of this.cars) {
      if (c.turn) {
        const speed = c.turn.straight ? c.cruise : c.cruise * 0.72;
        c.speed += Math.min(1, dt * 3) * (speed - c.speed);
        c.s += c.speed * dt;
        if (c.s >= c.turn.length) {
          this.owners.delete(c.lane.to);
          c.s -= c.turn.length;
          if (!c.turn.straight) c.turnCount++;
          c.lane = c.next;
          c.next = null;
          c.turn = null;
          c.lane.cars.add(c);
        }
      } else {
        const lane = c.lane;
        if (!c.next) c.next = this.chooseNext(c);
        let room = Infinity;
        for (const other of lane.cars) {
          if (other !== c && other.s > c.s)
            room = Math.min(room, other.s - c.s - (other.length + c.length) / 2 - 1.5);
        }
        const remaining = lane.length - c.s;
        let canEnter = true;
        if (remaining < 12) {
          canEnter = !this.owners.has(lane.to);
          if (canEnter)
            for (const other of c.next.cars) {
              if (other.s < (c.length + other.length) / 2 + 2.1) {
                canEnter = false;
                break;
              }
            }
          if (!canEnter) room = Math.min(room, remaining);
        }
        const target = Math.min(c.cruise, Math.sqrt(Math.max(0, 2 * 3.8 * room)));
        c.speed += (target - c.speed) * Math.min(1, dt * (target < c.speed ? 5 : 2));
        c.s += Math.min(Math.max(0, room), c.speed * dt);
        if (c.s >= lane.length - 0.001 && canEnter) {
          const carry = Math.max(0, c.s - lane.length);
          this.owners.set(lane.to, c);
          lane.cars.delete(c);
          c.turn = turnBetween(lane, c.next);
          c.s = carry;
        }
      }
      pose(c);
    }
  }
}
