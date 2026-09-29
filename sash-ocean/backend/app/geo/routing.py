"""Approximate maritime routing over the reference lane network.

Used to model an *expected* route (for deviation detection and planned voyage risk)
and to generate realistic synthetic tracks. It is not a navigational router.
"""
from __future__ import annotations

import heapq
from dataclasses import dataclass
from functools import lru_cache

from app.core.yamlconfig import lanes_data, ports_data
from app.geo.core import haversine_km, point_to_polyline_km


@dataclass(frozen=True)
class PortRef:
    unlocode: str
    name: str
    country: str
    lat: float
    lon: float
    connect: tuple[str, ...]
    approach: tuple[float, float] | None
    aliases: tuple[str, ...]


class LaneGraph:
    def __init__(self, nodes: dict[str, tuple[float, float]], edges: list[tuple[str, str]]):
        self.nodes = dict(nodes)
        self.adj: dict[str, dict[str, float]] = {n: {} for n in self.nodes}
        for a, b in edges:
            if a not in self.nodes or b not in self.nodes:
                raise ValueError(f"lane edge references unknown node: {a}-{b}")
            d = haversine_km(*self.nodes[a], *self.nodes[b])
            self.adj[a][b] = d
            self.adj[b][a] = d

    def add_node(self, node_id: str, pos: tuple[float, float], connect: list[str]) -> None:
        self.nodes[node_id] = pos
        self.adj.setdefault(node_id, {})
        for c in connect:
            d = haversine_km(*pos, *self.nodes[c])
            self.adj[node_id][c] = d
            self.adj[c][node_id] = d

    def nearest_nodes(self, lat: float, lon: float, k: int = 3) -> list[str]:
        ranked = sorted(
            (n for n in self.nodes if not n.startswith("PORT:")),
            key=lambda n: haversine_km(lat, lon, *self.nodes[n]),
        )
        return ranked[:k]

    def shortest_path(self, start: str, goal: str) -> list[str]:
        dist = {start: 0.0}
        prev: dict[str, str] = {}
        heap = [(0.0, start)]
        while heap:
            d, u = heapq.heappop(heap)
            if u == goal:
                break
            if d > dist.get(u, float("inf")):
                continue
            for v, w in self.adj[u].items():
                nd = d + w
                if nd < dist.get(v, float("inf")):
                    dist[v] = nd
                    prev[v] = u
                    heapq.heappush(heap, (nd, v))
        if goal not in dist:
            raise ValueError(f"no lane route between {start} and {goal}")
        path = [goal]
        while path[-1] != start:
            path.append(prev[path[-1]])
        return list(reversed(path))


@lru_cache
def ports() -> dict[str, PortRef]:
    out = {}
    for p in ports_data():
        out[p["unlocode"]] = PortRef(
            unlocode=p["unlocode"],
            name=p["name"],
            country=p["country"],
            lat=float(p["lat"]),
            lon=float(p["lon"]),
            connect=tuple(p.get("connect", [])),
            approach=tuple(p["approach"]) if p.get("approach") else None,
            aliases=tuple(a.upper() for a in p.get("aliases", [])),
        )
    return out


@lru_cache
def lane_graph() -> LaneGraph:
    data = lanes_data()
    nodes = {k: (float(v[0]), float(v[1])) for k, v in data["nodes"].items()}
    g = LaneGraph(nodes, [tuple(e) for e in data["edges"]])
    for p in ports().values():
        port_node = f"PORT:{p.unlocode}"
        if p.approach:
            appr = f"APPR:{p.unlocode}"
            g.add_node(appr, p.approach, list(p.connect))
            g.add_node(port_node, (p.lat, p.lon), [appr])
        else:
            g.add_node(port_node, (p.lat, p.lon), list(p.connect))
    return g


def resolve_port(text: str | None) -> PortRef | None:
    """Match a free-text AIS destination / UN/LOCODE / port name to a known port."""
    if not text:
        return None
    t = text.strip().upper().replace(">", " ").replace("_", " ")
    compact = t.replace(" ", "")
    allp = ports()
    if compact in allp:
        return allp[compact]
    for p in allp.values():
        if t == p.name.upper() or t in p.aliases:
            return p
    for p in allp.values():  # looser containment match ("ZA DUR" / "DURBAN OPL")
        if p.name.upper() in t or any(a in t for a in p.aliases if len(a) > 3):
            return p
    return None


def nearest_port(lat: float, lon: float) -> tuple[PortRef, float]:
    best = min(ports().values(), key=lambda p: haversine_km(lat, lon, p.lat, p.lon))
    return best, haversine_km(lat, lon, best.lat, best.lon)


def route_between_ports(origin: str, destination: str) -> list[tuple[float, float]]:
    g = lane_graph()
    path = g.shortest_path(f"PORT:{origin}", f"PORT:{destination}")
    return [g.nodes[n] for n in path]


def route_from_position(lat: float, lon: float, destination: str) -> list[tuple[float, float]]:
    """Expected route from an arbitrary position at sea to a destination port."""
    g = lane_graph()
    goal = f"PORT:{destination}"
    best: tuple[float, list[str]] | None = None
    for cand in g.nearest_nodes(lat, lon, k=4):
        try:
            path = g.shortest_path(cand, goal)
        except ValueError:
            continue
        pts = [g.nodes[n] for n in path]
        total = haversine_km(lat, lon, *pts[0]) + sum(
            haversine_km(*pts[i], *pts[i + 1]) for i in range(len(pts) - 1)
        )
        if best is None or total < best[0]:
            best = (total, path)
    if best is None:
        raise ValueError("no route")
    pts = [g.nodes[n] for n in best[1]]
    # Drop the first lane node if the vessel is already past it along the route.
    if len(pts) > 1:
        d_first, seg, _ = point_to_polyline_km(lat, lon, pts[:2])
        if haversine_km(lat, lon, *pts[1]) < haversine_km(*pts[0], *pts[1]):
            pts = pts[1:]
    return [(lat, lon), *pts]


def route_between_points(
    origin: tuple[float, float], destination: tuple[float, float]
) -> list[tuple[float, float]]:
    g = lane_graph()
    o = g.nearest_nodes(*origin, k=1)[0]
    d = g.nearest_nodes(*destination, k=1)[0]
    path = g.shortest_path(o, d)
    return [origin, *[g.nodes[n] for n in path], destination]
