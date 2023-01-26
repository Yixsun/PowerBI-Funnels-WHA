"use strict";

import "core-js/stable";
import "regenerator-runtime/runtime";
import "../style/visual.less";
import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstanceEnumeration = powerbi.VisualObjectInstanceEnumeration;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import * as d3 from "d3";
import svgObjectClass from "./Classes/svgObjectClass"
import svgSelectionClass from "./Classes/svgSelectionClass"
import checkIDSelected from "./Functions/checkIDSelected";
import settingsObject from "./Classes/settingsObject";
import viewModelObject from "./Classes/viewModel"
import plotData from "./Classes/plotData"
import lineData from "./Classes/lineData"
import plotPropertiesClass from "./Classes/plotProperties"
import getGroupKeys from "./Functions/getGroupKeys"
import { groupKeysT } from "./Functions/getGroupKeys"
import getAesthetic from "./Functions/getAesthetic"

type SelectionSVG = d3.Selection<SVGElement, any, any, any>;

export class Visual implements IVisual {
  private host: IVisualHost;
  private svg: SelectionSVG;
  private svgObjects: svgObjectClass;
  private svgSelections: svgSelectionClass;
  private viewModel: viewModelObject;
  private selectionManager: ISelectionManager;
  private settings: settingsObject;
  private plotProperties: plotPropertiesClass;


  constructor(options: VisualConstructorOptions) {
    console.log("start constructor");
    // Add reference to host object, for accessing environment (e.g. colour)
    this.host = options.host;

    // Get reference to element object for manipulation
    //   (reference to html container for visual)
    this.svg = d3.select(options.element)
                  .append("svg")
                  .classed("funnelchart", true);
    this.svgObjects = new svgObjectClass(this.svg);
    this.svgSelections = new svgSelectionClass();

    // Request a new selectionManager tied to the visual
    this.selectionManager = this.host.createSelectionManager();

    this.settings = new settingsObject();

    // Update dot highlighting on initialisation
    this.selectionManager.registerOnSelectCallback(() => {
      this.highlightIfSelected();
    })
    console.log("finish constructor");
  }

  public update(options: VisualUpdateOptions) {
    console.log("start update");
    // Update settings object with user-specified values (if present)
    this.settings.updateSettings(options.dataViews[0].metadata.objects);
    console.log("Updated settings:", this.settings);

    // Insert the viewModel object containing the user-input data
    //   This function contains the construction of the funnel
    //   control limits
    this.viewModel = new viewModelObject({ options: options,
                                           inputSettings: this.settings,
                                           host: this.host });
    console.log("Calculated limits");

    this.plotProperties = new plotPropertiesClass({
      options: options,
      viewModel: this.viewModel,
      inputSettings: this.settings
    });
    console.log("Updated plot properties");

    // Dynamically scale chart to use all available space
    this.svg.attr("width", this.plotProperties.width)
            .attr("height", this.plotProperties.height);


    this.initTooltipTracking();
    console.log("Initialised tooltips");

    this.drawXAxis();
    console.log("Drawn x-axis");

    this.drawYAxis();
    console.log("Drawn y-axis");

    // Plotting of scatter points
    this.drawDots();
    console.log("Drawn dots");

    this.drawLines();
    console.log("Drawn lines");

    this.addContextMenu();
    console.log("finish update");
  }

  // Function to render the properties specified in capabilities.json to the properties pane
  public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions):
    VisualObjectInstanceEnumeration {
      let propertyGroupName: string = options.objectName;
      // Object that holds the specified settings/options to be rendered
      let properties: VisualObjectInstance[] = [];
      properties.push({
        objectName: propertyGroupName,
        properties: this.settings.returnValues(propertyGroupName, this.viewModel.inputData),
        selector: null
      });
      return properties;
  }

  highlightIfSelected(): void {
    if (!this.svgSelections.dotSelection || !this.selectionManager.getSelectionIds()) {
      return;
    }
    let opacitySelected: number = this.settings.scatter.opacity.value;
    let opacityUnselected: number = this.settings.scatter.opacity_unselected.value;

    if (!this.selectionManager.getSelectionIds().length) {
      this.svgSelections.dotSelection.style("fill-opacity", d => opacitySelected);
      return;
    }

    this.svgSelections.dotSelection.style("fill-opacity", d => {
      return checkIDSelected(this.selectionManager.getSelectionIds() as ISelectionId[],
                          d.identity)
            ? opacitySelected
            : opacityUnselected;
    })
  }

  drawXAxis(): void {
    let xAxisProperties = this.viewModel.axisLimits.x;
    let xAxis: d3.Axis<d3.NumberValue>;

    if (xAxisProperties.ticks) {
      xAxis = d3.axisBottom(this.plotProperties.xScale)
    } else {
      xAxis = d3.axisBottom(this.plotProperties.xScale).tickValues([]);
    }

    this.svgObjects.xAxisGroup
        .call(xAxis)
        .attr("color", this.plotProperties.displayPlot ? "#000000" : "#FFFFFF")
        // Plots the axis at the correct height
        .attr("transform", "translate(0, " + (this.plotProperties.height - xAxisProperties.padding) + ")")
        .selectAll("text")
        // Rotate tick labels
        .attr("transform","rotate(-35)")
        // Right-align
        .style("text-anchor", "end")
        // Scale font
        .style("font-size", xAxisProperties.tick_size)
        .style("font-family", xAxisProperties.tick_font);

    let xAxisCoordinates: DOMRect = this.svgObjects.xAxisGroup.node().getBoundingClientRect();
    let bottomMidpoint: number = this.plotProperties.height - (this.plotProperties.height - xAxisCoordinates.bottom) / 2.5;

    this.svgObjects.xAxisLabels
        .attr("x",this.plotProperties.width/2)
        .attr("y",bottomMidpoint)
        .style("text-anchor", "middle")
        .text(xAxisProperties.label)
        .style("font-size", xAxisProperties.label_size)
        .style("font-family", xAxisProperties.label_font);
  }

  drawYAxis(): void {
    let yAxisProperties = this.viewModel.axisLimits.y;
    let yAxis: d3.Axis<d3.NumberValue>;

    if (yAxisProperties.ticks) {
      let prop_labels: boolean = this.viewModel.inputData
        ? this.viewModel.inputData.data_type === "PR" && this.viewModel.inputData.multiplier === 100
        : null;
      yAxis = d3.axisLeft(this.plotProperties.yScale) .tickFormat(d => {
        // If axis displayed on % scale, then disable axis values > 100%
        return prop_labels ? (<number>d).toFixed(2) + "%" : <string><unknown>d;
      });
    } else {
      yAxis = d3.axisLeft(this.plotProperties.yScale).tickValues([]);
    }

    // Draw axes on plot
    this.svgObjects.yAxisGroup
        .call(yAxis)
        .attr("color", this.plotProperties.displayPlot ? "#000000" : "#FFFFFF")
        .attr("transform", "translate(" +  yAxisProperties.padding + ",0)")
        // Scale font
        .style("font-size", yAxisProperties.tick_size)
        .style("font-family", yAxisProperties.tick_font);

    let yAxisCoordinates: DOMRect = this.svgObjects.yAxisGroup.node().getBoundingClientRect();
    let leftMidpoint: number = yAxisCoordinates.x * 0.7;

    this.svgObjects
        .yAxisLabels
        .attr("x",leftMidpoint)
        .attr("y",this.plotProperties.height/2)
        .attr("transform","rotate(-90," + leftMidpoint +"," + this.plotProperties.height/2 +")")
        .text(this.settings.y_axis.ylimit_label.value)
        .text(yAxisProperties.label)
        .style("text-anchor", "middle")
        .style("font-size", yAxisProperties.label_size)
        .style("font-family", yAxisProperties.label_font);
  }

  addContextMenu(): void {
    this.svg.on('contextmenu', (event) => {
      const eventTarget: EventTarget = event.target;
      let dataPoint: plotData = <plotData>(d3.select(<d3.BaseType>eventTarget).datum());
      this.selectionManager.showContextMenu(dataPoint ? dataPoint.identity : {}, {
        x: event.clientX,
        y: event.clientY
      });
      event.preventDefault();
    });
  }

  initTooltipTracking(): void {
    let height: number = this.plotProperties.height - this.settings.axispad.x.padding.value;
    this.svgSelections.tooltipLineSelection = this.svgObjects.tooltipLineGroup
                                      .selectAll(".ttip-line")
                                      .data(this.viewModel.scatterDots);
    let xAxisLine = this.svgSelections.tooltipLineSelection
                        .enter()
                        .append("rect")
                        .merge(<any>this.svgSelections.tooltipLineSelection);
    xAxisLine.classed("ttip-line", true);
    xAxisLine.attr("stroke-width", "1px")
              .attr("width", ".5px")
              .attr("height", height)
              .style("fill-opacity", 0);

    this.svgSelections.listeningRectSelection = this.svgObjects.listeningRect
                                      .selectAll(".obs-sel")
                                      .data(this.viewModel.scatterDots);

    let listenMerged = this.svgSelections.listeningRectSelection
                            .enter()
                            .append("rect")
                            .merge(<any>this.svgSelections.listeningRectSelection)
    listenMerged.classed("obs-sel", true);

    listenMerged.style("fill","transparent")
                .attr("width", this.plotProperties.width)
                .attr("height", height);
    if (this.plotProperties.displayPlot) {
      listenMerged.on("mousemove", (event) => {
        let xval: number = this.plotProperties.xScale.invert(event.pageX);

        let x_dist: number[] = this.viewModel
                                    .scatterDots
                                    .map(d => d.x)
                                    .map(d => Math.abs(d - xval));
        let minInd: number = d3.leastIndex(x_dist,(a,b) => a-b);

        let scaled_x: number = this.plotProperties.xScale(this.viewModel.scatterDots[minInd].x)
        let scaled_y: number = this.plotProperties.yScale(this.viewModel.scatterDots[minInd].value)

        this.host.tooltipService.show({
          dataItems: this.viewModel.scatterDots[minInd].tooltip,
          identities: [this.viewModel.scatterDots[minInd].identity],
          coordinates: [scaled_x, scaled_y],
          isTouchEvent: false
        });
        xAxisLine.style("fill-opacity", 1)
                  .attr("transform", "translate(" + scaled_x + ",0)");
      });

      listenMerged.on("mouseleave", () => {
        this.host.tooltipService.hide({
          immediately: true,
          isTouchEvent: false
        });
        xAxisLine.style("fill-opacity", 0);
      });
    } else {
      listenMerged.on("mousemove", () => {})
      listenMerged.on("mouseleave", () => {})
    }

    this.svgSelections.listeningRectSelection.exit().remove()
    listenMerged.exit().remove()
    xAxisLine.exit().remove()
  }

  drawDots(): void {
    let dot_size: number = this.settings.scatter.size.value;
    let dot_opacity: number = this.settings.scatter.opacity.value;
    let dot_opacity_unsel: number = this.settings.scatter.opacity_unselected.value;

    // Bind input data to dotGroup reference
    this.svgSelections.dotSelection = this.svgObjects.dotGroup
                            // List all child elements of dotGroup that have CSS class '.dot'
                            .selectAll(".dot")
                            .data(this.viewModel.scatterDots);

    // Update the datapoints if data is refreshed
    const MergedDotObject: d3.Selection<SVGCircleElement, any, any, any>
      = this.svgSelections.dotSelection.enter()
      .append("circle")
      .merge(<any>this.svgSelections.dotSelection);

    MergedDotObject.classed("dot", true);

    MergedDotObject.attr("cy", d => this.plotProperties.yScale(d.value))
                    .attr("cx", d => this.plotProperties.xScale(d.x))
                    .attr("r", dot_size)
                    // Fill each dot with the colour in each DataPoint
                    .style("fill", d => d.colour);

    this.highlightIfSelected();

    // Change opacity (highlighting) with selections in other plots
    // Specify actions to take when clicking on dots
    MergedDotObject.style("fill-opacity", d => {
      return this.viewModel.anyHighlights
        ? (d.highlighted ? dot_opacity : dot_opacity_unsel)
        : dot_opacity
    })
    .on("click", (event, d) => {
      // Propagate identities of selected data back to
      //   PowerBI based on all selected dots
      this.selectionManager
          .select(d.identity, (event.ctrlKey || event.metaKey))
          .then(ids => {
            MergedDotObject.style("fill-opacity", d => {
              return ids.length > 0
                ? (ids.indexOf(d.identity) >= 0 ? dot_opacity : dot_opacity_unsel)
                : dot_opacity
            });
          });
      event.stopPropagation();
    });

    if (this.plotProperties.displayPlot) {
      // Display tooltip content on mouseover
      MergedDotObject.on("mouseover", (event, d) => {
        // Get screen coordinates of mouse pointer, tooltip will
        //   be displayed at these coordinates
        let x: any = event.pageX;
        let y: any = event.pageY;

        this.host.tooltipService.show({
          dataItems: d.tooltip,
          identities: [d.identity],
          coordinates: [x, y],
          isTouchEvent: false
        });
      });

      // Specify that tooltips should move with the mouse
      MergedDotObject.on("mousemove", (event, d) => {
        // Get screen coordinates of mouse pointer, tooltip will
        //   be displayed at these coordinates
        let x: any = event.pageX;
        let y: any = event.pageY;

        // Use the 'move' service for more responsive display
        this.host.tooltipService.move({
          dataItems: d.tooltip,
          identities: [d.identity],
          coordinates: [x, y],
          isTouchEvent: false
        });
      });

      // Hide tooltip when mouse moves out of dot
      MergedDotObject.on("mouseout", () => {
        this.host.tooltipService.hide({
          immediately: true,
          isTouchEvent: false
        })
      });
    } else {
      MergedDotObject.on("mouseover", () => {});
      MergedDotObject.on("mousemove", () => {});
      MergedDotObject.on("mouseout", () => {});
    }
    MergedDotObject.exit().remove();
    this.svgSelections.dotSelection.exit().remove();

    this.svg.on('click', (event) => {
      this.selectionManager.clear();
      this.highlightIfSelected();
    });
  }

  drawLines(): void {
    console.log("lines: ", this.viewModel.groupedLines)
    this.svgSelections.lineSelection = this.svgObjects.lineGroup
                              .selectAll(".line")
                              .data(this.viewModel.groupedLines);

    let lineMerged = this.svgSelections.lineSelection
                          .enter()
                          .append("path")
                          .merge(<any>this.svgSelections.lineSelection);
    lineMerged.classed('line', true);

    let yLowerLimit = this.viewModel.axisLimits.y.lower;
    let yUpperLimit = this.viewModel.axisLimits.y.upper;

    lineMerged.attr("d", d => {
      return d3.line<lineData>()
                .x(d => this.plotProperties.xScale(d.x))
                .y(d => this.plotProperties.yScale(d.line_value))
                .defined(function(d) { return d.line_value !== null && d.line_value > yLowerLimit && d.line_value < yUpperLimit; })
                (d[1])
    })
    lineMerged.attr("fill", "none")
              .attr("stroke", d => getAesthetic(d[0], "lines", "colour", this.settings))
              .attr("stroke-width", d => getAesthetic(d[0], "lines", "width", this.settings))
              .attr("stroke-dasharray", d => getAesthetic(d[0], "lines", "type", this.settings));

    lineMerged.exit().remove();
    this.svgSelections.lineSelection.exit().remove();
  }
}
