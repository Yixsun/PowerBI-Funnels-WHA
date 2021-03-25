import * as d3 from "d3";
import syncSelectionState from "../src/syncSelectionState";

/**
 * Function for rendering scatter dots on the chart, adding tooltips,
 * and managing interactivity
 * 
 * @param DotObject         - Base object to render scatter points to
 * @param highlights        - Boolean indicating whether point should be highlighted
 * @param selectionManager  - PowerBI interface for managing cross-plot interactivity
 * @param tooltipService    - Object for management of tooltip rendering
 * @param x_scale           - d3 scale function for translating axis coordinates to screen coordinates
 * @param y_scale           - d3 scale function for translating axis coordinates to screen coordinates
 */
function makeDots(DotObject, highlights, selectionManager, tooltipService, x_scale, y_scale) {
    DotObject.attr("cy", d => y_scale(d.ratio))
             .attr("cx", d => x_scale(d.denominator))
             .attr("r", 4)
            // Fill each dot with the colour in each DataPoint
             .style("fill", d => d.colour);

    syncSelectionState(DotObject, selectionManager.getSelectionIds());

    // Change opacity (highlighting) with selections in other plots
    // Specify actions to take when clicking on dots
    DotObject
        .style("fill-opacity", d => highlights ? (d.highlighted ? 1.0 : 0.2) : 1.0)
        .on("click", d => {
            // Pass identities of selected data back to PowerBI
            selectionManager
                // Propagate identities of selected data back to
                //   PowerBI based on all selected dots
                .select(d.identity, (<any>d3).event.ctrlKey)
                // Change opacity of non-selected dots
                .then(ids => {
                    DotObject.style(
                        "fill-opacity", d => 
                        ids.length > 0 ? 
                        (ids.indexOf(d.identity) >= 0 ? 1.0 : 0.2) 
                        : 1.0
                    );
                });
         })
        // Display tooltip content on mouseover
        .on("mouseover", d => {
            // Get screen coordinates of mouse pointer, tooltip will
            //   be displayed at these coordinates
            //    Needs the '<any>' prefix, otherwise PowerBI doesn't defer
            //      to d3 properly
            let x = (<any>d3).event.pageX;
            let y = (<any>d3).event.pageY;

            tooltipService.show({
                dataItems: d.tooltips,
                identities: [d.identity],
                coordinates: [x, y],
                isTouchEvent: false
            });
        })
        // Specify that tooltips should move with the mouse
        .on("mousemove", d => {
            // Get screen coordinates of mouse pointer, tooltip will
            //   be displayed at these coordinates
            //    Needs the '<any>' prefix, otherwise PowerBI doesn't defer
            //      to d3 properly
            let x = (<any>d3).event.pageX;
            let y = (<any>d3).event.pageY;

            // Use the 'move' service for more responsive display
            tooltipService.move({
                dataItems: d.tooltips,
                identities: [d.identity],
                coordinates: [x, y],
                isTouchEvent: false
            });
        })
        // Hide tooltip when mouse moves out of dot
        .on("mouseout", d => {
            tooltipService.hide({
                immediately: true,
                isTouchEvent: false
            })
        });

    DotObject.exit().remove();
}

export default makeDots;