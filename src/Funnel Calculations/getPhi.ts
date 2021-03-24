import * as mathjs from "mathjs";

/**
 * Estimate the dispersion ratio of the observed responses using
 *    winsorised z-scores
 * 
 * @param z_adj 
 * @returns 
 */
function getPhi(z_adj) {
    return mathjs.sum(mathjs.square(z_adj)) / z_adj.length;
}

export default getPhi;