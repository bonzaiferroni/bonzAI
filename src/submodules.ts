import {RaidOperation} from "./submodules/RaidOperation/RaidOperation";
import {IntelOperation} from "./submodules/RaidOperation/IntelOperation";
import {SiegeOperation} from "./submodules/RaidOperation/SiegeOperation";
import {SabotageOperation} from "./submodules/RaidOperation/SabotageOperation";

export let submodules: {[opType: string]: any} = {
    raid: RaidOperation,
    intel: IntelOperation,
    siege: SiegeOperation,
    sabo: SabotageOperation,
};
