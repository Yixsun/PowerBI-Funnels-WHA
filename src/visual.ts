"use strict";

import "core-js/stable";
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
import { dataViewObjects } from "powerbi-visuals-utils-dataviewutils";
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import ISelectionId = powerbi.visuals.ISelectionId;
import makeDots from "./Plotting Functions/makeDots";
import makeLines from "./Plotting Functions/makeLines";
import updateSettings from "../src/updateSettings";
import getViewModel from "../src/getViewModel";
import * as d3 from "d3";
import * as mathjs from "mathjs";
import * as rmath from "lib-r-math.js";
import highlightIfSelected from "./Selection Helpers/highlightIfSelected";

// Used to represent the different datapoints on the chart
interface ScatterDots {
    category: string;
    numerator: number;
    denominator: number;
    ratio: number;
    colour: string;
    // ISelectionId allows the visual to report the selection choice to PowerBI
    identity: powerbi.visuals.ISelectionId;
    // Flag for whether dot should be highlighted by selections in other charts
    highlighted: boolean;
    // Tooltip data to print
    tooltips: VisualTooltipDataItem[];
};

interface LimitLines {
    limit: number;
    denominator: number;
};

// Separator between code that gets data from PBI, and code that renders
//   the data in the visual
interface ViewModel {
    scatterDots: ScatterDots[];
    lowerLimit99: LimitLines[];
    lowerLimit95: LimitLines[];
    upperLimit95: LimitLines[];
    upperLimit99: LimitLines[];
    maxRatio: number;
    maxDenominator: number;
    target: number;
    highlights: boolean;
};

export class Visual implements IVisual {
    private host: IVisualHost;
    private svg: d3.Selection<SVGElement, any, any, any>;
    private dotGroup: d3.Selection<SVGElement, any, any, any>;
    private dots: d3.Selection<any, any, any, any>;
    private UL99Group: d3.Selection<SVGElement, any, any, any>;
    private LL99Group: d3.Selection<SVGElement, any, any, any>;
    private UL95Group: d3.Selection<SVGElement, any, any, any>;
    private LL95Group: d3.Selection<SVGElement, any, any, any>;
    private targetGroup: d3.Selection<SVGElement, any, any, any>;
    private xAxisGroup: d3.Selection<SVGGElement, any, any, any>;
    private yAxisGroup: d3.Selection<SVGGElement, any, any, any>;
    private viewModel: ViewModel;

    // Method for notifying PowerBI of changes in the visual to propagate to the
    //   rest of the report
    private selectionManager: ISelectionManager;


    // Settings for plot aesthetics
    private settings = {
        axispad: {
            x: {
                padding: {
                    default: 50,
                    value: 50
                }
            },
            y: {
                padding: {
                    default: 50,
                    value: 50
                }
            }
        },
        funnel: {
            data_type: {
                default: "PR",
                value: "PR"
            },
            od_adjust: {
                default: "auto",
                value: "auto"
            }
        },
        scatter: {
            size: {
                default: 4,
                value: 4
            },
            colour: {
                default: "#000000",
                value: "#000000"
            },
            opacity: {
                default: 1,
                value: 1
            },
            opacity_unselected: {
                default: 0.2,
                value: 0.2
            }
        },
        lines: {
            width_99: {
                default: 3,
                value: 3
            },
            width_95: {
                default: 3,
                value: 3
            },
            width_target: {
                default: 1.5,
                value: 1.5
            },
            colour_99: {
                default: "#4682B4",
                value: "#4682B4"
            },
            colour_95: {
                default: "#4682B4",
                value: "#4682B4"
            },
            colour_target: {
                default: "#4682B4",
                value: "#4682B4"
            }
        },
        axis: {
            ylimit_l: {
                default: null,
                value: null
            },
            ylimit_u: {
                default: null,
                value: null
            },
            xlimit_l: {
                default: null,
                value: null
            },
            xlimit_u: {
                default: null,
                value: null
            }
        }
    }

    constructor(options: VisualConstructorOptions) {
        // Add reference to host object, for accessing environment (e.g. colour)
        this.host = options.host;

                    // Get reference to element object for manipulation
                    //   (reference to html container for visual)
        this.svg = d3.select(options.element)
                    // Create new svg element inside container
                     .append("svg")
                     .classed("funnelchart", true);

        this.UL99Group = this.svg.append("g")
                                .classed("line-group", true);
        this.LL99Group = this.svg.append("g")
                                .classed("line-group", true);
        this.UL95Group = this.svg.append("g")
                                .classed("line-group", true);
        this.LL95Group = this.svg.append("g")
                                .classed("line-group", true);
        this.targetGroup = this.svg.append("g")
                                .classed("line-group", true);
        this.dotGroup = this.svg.append("g")
                                .classed("dotGroup", true);

        // Add a grouping ('g') element to the canvas that will later become the x-axis
        this.xAxisGroup = this.svg.append("g")
                                  .classed("x-axis", true);

        // Add a grouping ('g') element to the canvas that will later become the y-axis
        this.yAxisGroup = this.svg.append("g")
                                  .classed("y-axis", true);

        // Request a new selectionManager tied to the visual
        this.selectionManager = this.host.createSelectionManager();
        this.selectionManager.registerOnSelectCallback(() => {
            highlightIfSelected(this.dots, this.selectionManager.getSelectionIds(),
                                this.settings.scatter.opacity.value,
                                this.settings.scatter.opacity_unselected.value);
        })
    }

    public update(options: VisualUpdateOptions) {
        // Update settings object with user-specified values (if present)
        updateSettings(this.settings, options.dataViews[0].metadata.objects);

        // Insert the viewModel object containing the user-input data
        //   This function contains the construction of the funnel
        //   control limits
        this.viewModel = getViewModel(options, this.settings, this.host);

        // Get the width and height of plotting space
        let width = options.viewport.width;
        let height = options.viewport.height;

        // Add appropriate padding so that plotted data doesn't overlay axis
        let xAxisPadding = this.settings.axispad.x.padding.value;
        let yAxisPadding = this.settings.axispad.y.padding.value;
        let xAxisMin = this.settings.axis.xlimit_l.value ? this.settings.axis.xlimit_l.value : 0;
        let xAxisMax = this.settings.axis.xlimit_u.value ? this.settings.axis.xlimit_u.value : this.viewModel.maxDenominator;
        let yAxisMin = this.settings.axis.ylimit_l.value ? this.settings.axis.ylimit_l.value : 0;
        let yAxisMax = this.settings.axis.ylimit_u.value ? this.settings.axis.ylimit_u.value : this.viewModel.maxRatio;

        // Dynamically scale chart to use all available space
        this.svg.attr("width", width)
                .attr("height", height);

        // Define axes for chart.
        //   Takes a given plot axis value and returns the appropriate screen height
        //     to plot at.
        let yScale = d3.scaleLinear()
                       .domain([yAxisMin, yAxisMax])
                       .range([height - xAxisPadding, 0]);
        let xScale = d3.scaleLinear()
                        .domain([xAxisMin, xAxisMax])
                        .range([yAxisPadding, width]);

        // Specify inverse scaling that will return a plot axis value given an input
        //   screen height. Used to display line chart tooltips.
        let yScale_inv = d3.scaleLinear()
                       .domain([height - xAxisPadding, 0])
                       .range([yAxisMin, yAxisMax]);
        let xScale_inv = d3.scaleLinear()
                            .domain([yAxisPadding, width])
                            .range([xAxisMin, xAxisMax]);

        let yAxis = d3.axisLeft(yScale);
        let xAxis = d3.axisBottom(xScale);

        // Draw axes on plot
        this.yAxisGroup
            .call(yAxis)
            .attr("transform", "translate(" +  yAxisPadding + ",0)");

        this.xAxisGroup
            .call(xAxis)
            // Plots the axis at the correct height
            .attr("transform", "translate(0, " + (height - xAxisPadding) + ")")
            .selectAll("text")
            // Rotate tick labels
            .attr("transform","rotate(-35)")
            // Right-align
            .style("text-anchor", "end")
            // Scale font
            .style("font-size","x-small");


        // Bind input data to dotGroup reference
        this.dots = this.dotGroup
                       // List all child elements of dotGroup that have CSS class '.dot'
                       .selectAll(".dot")
                       // Matches input array to a list, returns three result sets
                       //   - HTML element for which there are no matching datapoint (if so, creates new elements to be appended)
                       .data(this.viewModel.scatterDots.filter(d => (d.ratio > yAxisMin && d.ratio < yAxisMax && d.denominator > xAxisMin && d.denominator < xAxisMax)));

        // Update the datapoints if data is refreshed
        const dots_merged = this.dots.enter()
            .append("circle")
            .merge(<any>this.dots);

        dots_merged.classed("dot", true);

        // Plotting of scatter points
        makeDots(dots_merged, this.settings,
                 this.viewModel.highlights, this.selectionManager,
                 this.host.tooltipService, xScale, yScale);
    

        // Bind calculated control limits and target line to respective plotting objects
        let linesLL99 = this.LL99Group
            .selectAll(".line")
            .data([this.viewModel.lowerLimit99.filter(d => (d.limit != -9999) && (d.limit > yAxisMin))]);

        let linesUL99 = this.UL99Group
            .selectAll(".line")
            .data([this.viewModel.upperLimit99.filter(d => (d.limit != -9999) && (d.limit < yAxisMax))]);

        let linesUL95 = this.UL95Group
            .selectAll(".line")
            .data([this.viewModel.upperLimit95.filter(d => (d.limit != -9999) && (d.limit < yAxisMax))]);

        let linesLL95 = this.LL95Group
            .selectAll(".line")
            .data([this.viewModel.lowerLimit95.filter(d => (d.limit != -9999) && (d.limit > yAxisMin))]);
        
        const linesLL99Merged = linesLL99.enter()
                                            .append("path")
                                            .merge(<any>linesLL99)
                                            .classed("line", true)
        
        const linesLL95_merged = linesLL95.enter()
                                            .append("path")
                                            .merge(<any>linesLL95)
                                            .classed("line", true)
        const linesUL95_merged = linesUL95.enter()
                                          .append("path")
                                          .merge(<any>linesUL95)
                                          .classed("line", true)
        
        const linesUL99_merged = linesUL99.enter()
                                          .append("path")
                                          .merge(<any>linesUL99)
                                          .classed("line", true)

        let lineTarget = this.targetGroup
                             .selectAll(".line")
                             .data([this.viewModel.upperLimit99]);

        const lineTarget_merged = lineTarget.enter()
                                            .append("path")
                                            .merge(<any>lineTarget)
                                            .classed("line", true)
        
        // Initial construction of lines, run when plot is first rendered.
        //   Text argument specifies which type of line is required (controls aesthetics),
        //   inverse scale objects used to display tooltips on drawn control limits 
        makeLines(linesLL99Merged, this.settings,
                    xScale, yScale, "99.8%",
                    this.viewModel, this.host.tooltipService,
                    xScale_inv, yScale_inv);
        
        makeLines(linesLL95_merged, this.settings,
                    xScale, yScale, "95%",
                    this.viewModel, this.host.tooltipService,
                    xScale_inv, yScale_inv);

        makeLines(linesUL95_merged, this.settings,
                    xScale, yScale, "95%",
                    this.viewModel, this.host.tooltipService,
                    xScale_inv, yScale_inv);

        makeLines(linesUL99_merged, this.settings,
                    xScale, yScale, "99.8%",
                    this.viewModel, this.host.tooltipService,
                    xScale_inv, yScale_inv);

        makeLines(lineTarget_merged, this.settings,
                    xScale, yScale, "target",
                    this.viewModel, this.host.tooltipService);
        
        this.dots.exit().remove();

        this.svg.on('click', (d) => {
            this.selectionManager.clear();
            
            highlightIfSelected(dots_merged, [],
            this.settings.scatter.opacity.value, this.settings.scatter.opacity_unselected.value);
        });
    }

    // Function to render the properties specified in capabilities.json to the properties pane
    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): 
        VisualObjectInstanceEnumeration {
            let propertyGroupName = options.objectName;
            // Object that holds the specified settings/options to be rendered
            let properties: VisualObjectInstance[] = [];

            // Call a different function for each specified property group
            switch (propertyGroupName) {
                // Specify behaviour for x-axis settings
                case "funnel":
                    // Add y-axis settings to object to be rendered
                    properties.push({
                        objectName: propertyGroupName,
                        properties: {
                            data_type: this.settings.funnel.data_type.value,
                            od_adjust: this.settings.funnel.od_adjust.value
                        },
                        selector: null
                    });
                break; 
                case "scatter":
                    properties.push({
                        objectName: propertyGroupName,
                        properties: {
                            size: this.settings.scatter.size.value,
                            colour: this.settings.scatter.colour.value,
                            opacity: this.settings.scatter.opacity.value,
                            opacity_unselected: this.settings.scatter.opacity_unselected.value
                        },
                        selector: null
                    });
                break; 
                case "lines":
                    properties.push({
                        objectName: propertyGroupName,
                        properties: {
                            width_99: this.settings.lines.width_99.value,
                            width_95: this.settings.lines.width_95.value,
                            width_target: this.settings.lines.width_target.value,
                            colour_99: this.settings.lines.colour_99.value,
                            colour_95: this.settings.lines.colour_95.value,
                            colour_target: this.settings.lines.colour_target.value
                        },
                        selector: null
                    });
                break; 
                case "axis":
                    properties.push({
                        objectName: propertyGroupName,
                        properties: {
                            ylimit_l: this.settings.axis.ylimit_l.value,
                            ylimit_u: this.settings.axis.ylimit_u.value,
                            xlimit_l: this.settings.axis.xlimit_l.value,
                            xlimit_u: this.settings.axis.xlimit_u.value
                        },
                        selector: null
                    });
                break; 
            };
            return properties;
        }
}