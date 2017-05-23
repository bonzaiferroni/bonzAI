import {Layout} from "./Layout";
import {BuildingPlannerData} from "../../interfaces";
export class FlexLayout extends Layout {
    public fixedMap: BuildingPlannerData = {
        name: "Flex",
        pivot: {x: 13, y: 10},
        radius: 4,
        taper: 3,
        buildings: {
            "road": {pos : [{x: 9, y: 10}, {x: 10, y: 9}, {x: 11, y: 8}, {x: 12, y: 7}, {x: 13, y: 6}, {x: 14, y: 7},
                {x: 15, y: 8}, {x: 16, y: 9}, {x: 17, y: 10}, {x: 16, y: 11}, {x: 15, y: 12}, {x: 14, y: 13},
                {x: 13, y: 14}, {x: 12, y: 13}, {x: 11, y: 12}, {x: 10, y: 11}, {x: 12, y: 9}, {x: 13, y: 10},
                {x: 14, y: 11}, {x: 11, y: 10}, {x: 13, y: 8}]},
            "storage": {pos : [{x: 13, y: 7}]},
            "lab": {pos : [{x: 14, y: 10}, {x: 13, y: 11}, {x: 12, y: 10}, {x: 14, y: 12}, {x: 15, y: 11},
                {x: 13, y: 9}, {x: 12, y: 11}, {x: 14, y: 9}, {x: 13, y: 12}, {x: 15, y: 10}]},
            "spawn": {pos : [{x: 11, y: 11}, {x: 12, y: 12}, {x: 13, y: 13}]},
            "powerSpawn": {pos : [{x: 10, y: 10}]},
            "terminal": {pos : [{x: 11, y: 9}]},
            "link": {pos : [{x: 15, y: 9}]},
            "nuker": {pos : [{x: 16, y: 10}]}
        }
    };
}