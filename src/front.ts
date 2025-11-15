import * as d3 from "d3";
import { loadGraph, simulation } from "./load";

// Size
export const width = window.innerWidth;
export const height = window.innerHeight - 80;

// SVG
export const svg = d3.select("#graph")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

// Arrowhead
const defs = svg.append("defs");
defs.append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 28)
    .attr("refY", 0)
    .attr("markerWidth", 8)
    .attr("markerHeight", 8)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#999");

export const g = svg.append("g");

// Zoom
const zoom = d3.zoom()
    .scaleExtent([0.2, 5])
    .on("zoom", (event) => g.attr("transform", event.transform));
svg.call(zoom);

// Start
loadGraph();

// Resize
window.addEventListener("resize", () => {
    const w = window.innerWidth;
    const h = window.innerHeight - 80;
    svg.attr("width", w).attr("height", h);
    if (simulation) {
        simulation.force("center", d3.forceCenter(w / 2, h / 2))
            .alpha(0.3).restart();
    }
});
