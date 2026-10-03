import * as d3 from "d3";
import {
  columnLabel,
  edgePath,
  graphDimmed,
  graphNodeClass,
  nodeTypeLabel,
  shortText,
  type GraphEdgeDatum,
  type GraphNodeDatum,
  type GraphSelection,
  type StateSpaceGraph,
} from "./trace-graph.js";

const numberFormat = new Intl.NumberFormat("zh-CN");

export class GraphCanvas {
  private zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
  private fit: d3.ZoomTransform | null = null;
  private initial: d3.ZoomTransform | null = null;

  constructor(private readonly element: SVGSVGElement) {}

  render(
    graph: StateSpaceGraph,
    selection: GraphSelection,
    selectNode: (node: GraphNodeDatum) => void,
  ): void {
    const svg = d3.select(this.element);
    svg.selectAll("*").remove();
    const width = this.element.clientWidth || 1120;
    const height = this.element.clientHeight || 820;
    this.element.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const scene = svg.append("g");
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.06, 3])
      .on("zoom", (event) => {
        scene.attr("transform", event.transform);
      });
    this.zoom = zoom;
    this.initial = d3.zoomIdentity.translate(40, 34).scale(0.92);
    this.fit = d3.zoomIdentity
      .translate(26, 28)
      .scale(Math.max(0.06, Math.min(1, width / graph.width, height / graph.height)));
    svg.call(zoom).call(zoom.transform, this.initial);

    const bands = scene
      .append("g")
      .attr("class", "column-bands")
      .selectAll("g.column-band")
      .data(graph.columns)
      .join("g")
      .attr("class", "column-band")
      .attr("transform", (column) => `translate(${18 + column * 304},0)`);
    bands
      .append("rect")
      .attr("x", 0)
      .attr("y", 8)
      .attr("width", 282)
      .attr("height", graph.height - 24)
      .attr("rx", 8);
    bands.append("text").attr("x", 10).attr("y", 18).text(columnLabel);

    scene
      .append("g")
      .attr("class", "edge-layer")
      .selectAll<SVGPathElement, GraphEdgeDatum>("path")
      .data(graph.edges)
      .join("path")
      .attr(
        "class",
        (edge) =>
          `graph-edge${graphDimmed(edge.source, selection) && graphDimmed(edge.target, selection) ? " dimmed" : ""}`,
      )
      .attr("d", edgePath);
    const cards = scene
      .append("g")
      .attr("class", "node-layer")
      .selectAll<SVGGElement, GraphNodeDatum>("g.graph-node")
      .data(graph.nodes)
      .join("g")
      .attr("class", (node) => graphNodeClass(node, selection))
      .attr("transform", (node) => `translate(${node.x},${node.y})`)
      .on("click", (event, node) => {
        event.stopPropagation();
        selectNode(node);
      });
    cards
      .append("rect")
      .attr("width", (node) => node.width)
      .attr("height", (node) => node.height)
      .attr("rx", 8);
    cards.append("text").attr("class", "type").attr("x", 12).attr("y", 17).text(nodeTypeLabel);
    cards
      .append("text")
      .attr("class", "count")
      .attr("x", (node) => node.width - 12)
      .attr("y", 17)
      .attr("text-anchor", "end")
      .text((node) =>
        node.members.length > 1 ? `x${numberFormat.format(node.members.length)}` : "",
      );
    cards
      .append("text")
      .attr("class", "title")
      .attr("x", 12)
      .attr("y", 39)
      .text((node) => shortText(node.title, 30));
    cards
      .append("text")
      .attr("class", "subtitle")
      .attr("x", 12)
      .attr("y", 58)
      .text((node) => shortText(node.subtitle, 34));
  }

  refreshSelection(selection: GraphSelection): void {
    d3.select(this.element)
      .selectAll<SVGGElement, GraphNodeDatum>("g.graph-node")
      .attr("class", (node) => graphNodeClass(node, selection));
  }
  zoomBy(factor: number): void {
    if (this.zoom)
      d3.select(this.element).transition().duration(180).call(this.zoom.scaleBy, factor);
  }
  reset(): void {
    this.transform(this.initial);
  }
  fitGraph(): void {
    this.transform(this.fit);
  }
  private transform(value: d3.ZoomTransform | null): void {
    if (this.zoom && value)
      d3.select(this.element).transition().duration(180).call(this.zoom.transform, value);
  }
}
