import { describe, expect, test } from "bun:test";
import type { Geometry } from "../review/anchor";
import {
  containRect,
  geometryCenter,
  projectPoint,
  unprojectPoint,
  type ViewerTransform,
} from "./geometry";

const base: ViewerTransform = {
  contentRect: { left: 10, top: 20, width: 200, height: 100 },
  zoom: 1,
  panX: 0,
  panY: 0,
  rotation: 0,
};

describe("containRect (letterbox math)", () => {
  test("pillarboxes a 16:9 video in a square box", () => {
    const r = containRect({ width: 100, height: 100 }, { width: 1920, height: 1080 });
    expect(r.width).toBeCloseTo(100);
    expect(r.height).toBeCloseTo(56.25);
    expect(r.top).toBeCloseTo((100 - 56.25) / 2);
    expect(r.left).toBeCloseTo(0);
  });
  test("letterboxes a tall image in a wide box", () => {
    const r = containRect({ width: 200, height: 100 }, { width: 100, height: 200 });
    expect(r.height).toBeCloseTo(100);
    expect(r.width).toBeCloseTo(50);
    expect(r.left).toBeCloseTo((200 - 50) / 2);
  });
});

describe("project/unproject round-trips", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 0.5, y: 0.5 },
    { x: 0.25, y: 0.75 },
  ];
  const transforms: ViewerTransform[] = [
    base,
    { ...base, zoom: 2.5 },
    { ...base, zoom: 1.8, panX: -30, panY: 15 },
    { ...base, rotation: 90 },
    { ...base, rotation: 180, zoom: 1.4 },
    { ...base, rotation: 270, panX: 12, panY: -7, zoom: 2 },
  ];
  for (const t of transforms) {
    for (const p of points) {
      test(`unproject(project(p)) ≈ p @ zoom=${t.zoom} rot=${t.rotation}`, () => {
        const screen = projectPoint(p, t);
        const back = unprojectPoint(screen.x, screen.y, t);
        expect(back.x).toBeCloseTo(p.x, 6);
        expect(back.y).toBeCloseTo(p.y, 6);
      });
    }
  }
});

describe("geometryCenter", () => {
  test("rectangle center", () => {
    const g: Geometry = { kind: "RECTANGLE", x: 0.2, y: 0.2, width: 0.4, height: 0.4 };
    expect(geometryCenter(g)).toEqual({ x: 0.4, y: 0.4 });
  });
  test("arrow midpoint", () => {
    const g: Geometry = { kind: "ARROW", x1: 0, y1: 0, x2: 1, y2: 1 };
    expect(geometryCenter(g)).toEqual({ x: 0.5, y: 0.5 });
  });
});
