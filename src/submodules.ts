import {RaidOperation} from "./submodules/RaidOperation/RaidOperation";
import {IntelOperation} from "./submodules/RaidOperation/IntelOperation";

export let submodules: {[opType: string]: any} = {
    raid: RaidOperation,
    intel: IntelOperation,
};
