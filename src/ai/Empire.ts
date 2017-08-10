import {SpawnGroup} from "./SpawnGroup";
import {Profiler} from "../Profiler";
import {Traveler} from "./Traveler";
import {WorldMap} from "./WorldMap";
import {MarketTrader} from "./MarketTrader";
import {BonzaiDiplomat} from "./BonzaiDiplomat";
import {BonzaiNetwork} from "./BonzaiNetwork";
import {Scheduler} from "../Scheduler";
import {MemHelper} from "../helpers/MemHelper";
import {Notifier} from "../notifier";
import {Janitor} from "./Janitor";
import {Diplomat} from "./Diplomat";
import {TradeNetwork} from "./TradeNetwork";
import {Archiver} from "./Archiver";
import {AbstractAgent} from "./agents/AbstractAgent";
import {MatrixHelper} from "../helpers/MatrixHelper";
import {SignMaker} from "./SignMaker";

export class Empire {

    public spawnGroups: {[roomName: string]: SpawnGroup};
    public diplomat: Diplomat;
    public map: WorldMap;
    public network: TradeNetwork;
    public market: MarketTrader;
    public janitor: Janitor;
    private updateTick: number;

    public static get(): Empire {
        global.root = empire;
        return empire;
    }

    /**
     * Occurs in init
     */

    public init() {
        this.initMemory();
        this.diplomat = new Diplomat();
        this.map = new WorldMap(this.diplomat);
        this.spawnGroups = this.map.init();
        this.network = new TradeNetwork(this.map);
        this.market = new MarketTrader(this.network);

        let blacklist: {[roomName: string]: boolean } = {};
        for (let roomName in this.map.foesMap) {
            blacklist[roomName] = true;
        }
        this.market.updateBlacklist(blacklist);

        this.janitor = new Janitor();
        this.janitor.init();
        SpawnGroup.init(this.spawnGroups);
        Archiver.init();
    }

    /**
     * Occurs during tick, before operation phases
     */

    public update() {
        if (this.updateTick === Game.time) { return; }
        this.updateTick = Game.time;

        this.diplomat.update();
        this.map.update();
        this.network.update();
        this.market.update();
        this.janitor.update();
        SpawnGroup.update(this.spawnGroups);
        Archiver.update();
        Scheduler.update();
        AbstractAgent.update();
        MatrixHelper.update();
    }

    /**
     * Occurs after operation phases
     */

    public finalize() {
        this.map.actions();
        this.network.actions();
        this.market.actions();
        this.janitor.actions();
        SignMaker.actions();
        SpawnGroup.finalize(this.spawnGroups);
        Archiver.finalize();
        Scheduler.finalize(); // runs passive processes while cpu is under limit, need to run last
    }

    public underCPULimit() {
        return Profiler.proportionUsed() < .8;
    }

    public getSpawnGroup(roomName: string) {
        return this.spawnGroups[roomName];
    }

    public spawnFromClosest(targetRoomName: string, body: string[], name: string) {
        let closest: SpawnGroup;
        let bestDistance = Number.MAX_VALUE;
        for (let roomName in this.spawnGroups) {
            let distance = Game.map.getRoomLinearDistance(targetRoomName, roomName);
            if (distance < bestDistance) {
                bestDistance = distance;
                closest = this.spawnGroups[roomName];
            }
        }
        return closest.spawn(body, name);
    }

    public initMemory() {
        _.defaultsDeep(Memory, {
            stats: {},
            temp: {},
            playerConfig: {
                terminalNetworkRange: 6,
                muteSpawn: false,
                enableStats: false,
                creditReserveAmount: Number.MAX_VALUE,
                powerMinimum: 9000,
            },
            profiler: {},
            traders: {},
            powerObservers: {},
            notifier: [],
            cpu: {
                history: [],
                average: Game.cpu.getUsed(),
            },
            hostileMemory: {},
            empire: {},
            freelance: {},
            marketTrader: {},
        });
    }
}

export let empire: Empire = new Empire();
global["empire"] = empire;
