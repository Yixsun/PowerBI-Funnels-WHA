import powerbi from "powerbi-visuals-api";
type DataViewPropertyValue = powerbi.DataViewPropertyValue
type VisualObjectInstanceEnumeration = powerbi.VisualObjectInstanceEnumeration;
import VisualEnumerationInstanceKinds = powerbi.VisualEnumerationInstanceKinds;
import { dataViewWildcard } from "powerbi-visuals-utils-dataviewutils";
import {
  canvasSettings,
  funnelSettings,
  outliersSettings,
  scatterSettings,
  lineSettings,
  xAxisSettings,
  yAxisSettings,
  AllSettingsTypes
} from "./settingsGroups"
import { extractSetting, extractConditionalFormatting } from "../Functions";

export default class settingsClass {
  [key: string] : any;
  canvas: canvasSettings;
  funnel: funnelSettings;
  scatter: scatterSettings;
  lines: lineSettings;
  x_axis: xAxisSettings;
  y_axis: yAxisSettings;
  outliers: outliersSettings;
  // Specify the names of settings which can be provided as data
  // so that the correct value can be rendered to the settings pane

  update(inputView: powerbi.DataView): void {
    const inputObjects: powerbi.DataViewObjects = inputView.metadata.objects;
    // Get the names of all classes in settingsClass which have values to be updated
    const allSettingGroups: string[] = Object.getOwnPropertyNames(this);
    allSettingGroups.forEach(settingGroup => {
      const condFormatting: AllSettingsTypes = inputView.categorical.categories
                            ? extractConditionalFormatting(inputView.categorical, settingGroup, this)[0]
                            : null;
      // Get the names of all settings in a given class and
      // use those to extract and update the relevant values
      const settingNames: string[] = Object.getOwnPropertyNames(this[settingGroup]);
      settingNames.forEach(settingName => {
        this[settingGroup][settingName].value
          = condFormatting ? condFormatting[settingName as keyof AllSettingsTypes]
                           : extractSetting(inputObjects, settingGroup, settingName,
                                            this[settingGroup][settingName].default)
      })
    })
  }

  /**
   * Function to extract all values for a given settings group, which are then
   * rendered to the Settings pane in PowerBI
   *
   * @param settingGroupName
   * @param inputData
   * @returns An object where each element is the value for a given setting in the named group
   */
  createSettingsEntry(settingGroupName: string): VisualObjectInstanceEnumeration {
    const settingNames: string[] = Object.getOwnPropertyNames(this[settingGroupName]);

    const properties: Record<string, DataViewPropertyValue> = Object.fromEntries(
      settingNames.map(settingName => {
        const settingValue: DataViewPropertyValue = this[settingGroupName][settingName].value
        return [settingName, settingValue]
      })
    )
    return [{
      objectName: settingGroupName,
      properties: properties,
      propertyInstanceKind: Object.fromEntries(settingNames.map(setting => [setting, VisualEnumerationInstanceKinds.ConstantOrRule])),
      selector: dataViewWildcard.createDataViewWildcardSelector(dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals)
    }];
  }

  constructor() {
    this.canvas = new canvasSettings();
    this.funnel = new funnelSettings();
    this.scatter = new scatterSettings();
    this.lines = new lineSettings();
    this.x_axis = new xAxisSettings();
    this.y_axis = new yAxisSettings();
    this.outliers = new outliersSettings();
  }
}
