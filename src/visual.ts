"use strict";

import type powerbi from "powerbi-visuals-api";
type EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
type VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;
import * as d3 from "./D3 Plotting Functions/D3 Modules";
import { viewModelClass } from "./Classes"
import { validateDataView } from "./Functions";
import { drawXAxis, drawYAxis, drawTooltipLine, drawLines,
          drawDots, updateHighlighting, addContextMenu } from "./D3 Plotting Functions"

export type svgBaseType = d3.Selection<SVGSVGElement, unknown, null, undefined>;

export class Visual implements powerbi.extensibility.IVisual {
  host: powerbi.extensibility.visual.IVisualHost;
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  viewModel: viewModelClass;
  selectionManager: powerbi.extensibility.ISelectionManager;

  constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
    this.svg = d3.select(options.element).append("svg");
    this.host = options.host;
    this.viewModel = new viewModelClass();

    this.selectionManager = this.host.createSelectionManager();
    this.selectionManager.registerOnSelectCallback(() => {
      this.svg.call(updateHighlighting, this);
    })
    this.initialiseSVG();
  }

  public update(options: powerbi.extensibility.visual.VisualUpdateOptions) {
    try {
      this.host.eventService.renderingStarted(options);
      // Remove printed error if refreshing after a previous error run
      this.svg.select(".errormessage").remove();
      this.svg.attr("width", options.viewport.width)
              .attr("height", options.viewport.height)

      this.viewModel.inputSettings.update(options.dataViews[0]);
      validateDataView(options.dataViews);
      this.viewModel.update(options, this.host);

      this.svg.call(drawXAxis, this)
              .call(drawYAxis, this)
              .call(drawTooltipLine, this)
              .call(drawLines, this)
              .call(drawDots, this)
              .call(updateHighlighting, this)
              .call(addContextMenu, this);

      if (this.viewModel.inputData.warningMessage !== "") {
        this.host.displayWarningIcon("Invalid inputs have been removed",
                                      this.viewModel.inputData.warningMessage);
      }

      this.host.eventService.renderingFinished(options);
    } catch (caught_error) {
      // Clear any existing plot items/graphics
      this.initialiseSVG(true);
      const errMessageSVG = this.svg.append("g").classed("errormessage", true);

      if (caught_error?.name !== "DataValidationError") {
        errMessageSVG.append('text')
                    .attr("x",options.viewport.width / 2)
                    .attr("y",options.viewport.height / 3)
                    .style("text-anchor", "middle")
                    .text("Internal Error! Please file a bug report with the following text:")
                    .style("font-size", "10px");
      }

      errMessageSVG.append('text')
                    .attr("x",options.viewport.width / 2)
                    .attr("y",options.viewport.height / 2)
                    .style("text-anchor", "middle")
                    .text(caught_error.message)
                    .style("font-size", "10px");

      console.error(caught_error)
      this.host.eventService.renderingFailed(options);
    }
  }

  // Function to render the properties specified in capabilities.json to the properties pane
  public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumerationObject {
    return this.viewModel.inputSettings.createSettingsEntry(options.objectName);
  }

  initialiseSVG(removeAll: boolean = false): void {
    if (removeAll) {
      this.svg.selectChildren().remove();
    }
    this.svg.append('g').classed("linesgroup", true)
    this.svg.append('g').classed("dotsgroup", true)
    this.svg.append('line').classed("ttip-line-x", true)
    this.svg.append('line').classed("ttip-line-y", true)
    this.svg.append('g').classed("xaxisgroup", true)
    this.svg.append('text').classed("xaxislabel", true)
    this.svg.append('g').classed("yaxisgroup", true)
    this.svg.append('text').classed("yaxislabel", true)
  }
}
