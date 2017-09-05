import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";
import {InvaderGuru} from "./InvaderGuru";
import {PosHelper} from "../../helpers/PosHelper";
import {CombatMission, CombatMissionMemory} from "./CombatMission";
import {CombatAgent} from "../agents/CombatAgent";
import {AgentManifest} from "./EasyMission";
import {CreepHelper} from "../../helpers/CreepHelper";
import {Notifier} from "../../notifier";

export interface BodyguardMissionMemory extends CombatMissionMemory {
}

export class BodyguardMission extends CombatMission {

    protected prespawn: number;
    protected targetName: string;
    public memory: BodyguardMissionMemory;

    /**
     * Remote defense for non-owned rooms. If boosted invaders are likely, use EnhancedBodyguardMission
     * @param operation
     * @param targetName
     */

    constructor(operation: Operation, targetName: string) {
        super(operation, "bodyguard", targetName);
    }

    protected init() {
        super.init();
        this.prespawn = Game.map.getRoomLinearDistance(this.targetName, this.spawnGroup.room.name) * 50;
    }

    protected buildManifest(): AgentManifest {
        let manifest: AgentManifest = {
            leeroy: {
                agentClass: CombatAgent,
                max: this.leeroyMax,
                body: this.leeroyBody,
                actions: this.combatActions,
                options: {
                    prespawn: 50,
                    deathCallback: this.adjustPotencyCallback,
                },
            },
            bigLee: {
                agentClass: CombatAgent,
                max: this.bigLeeMax,
                body: this.bigLeeBody,
                actions: this.combatActions,
                options: {
                    freelance: {
                        roleName: "ranger",
                        roomName: this.targetName,
                        requiredRating: 250,
                    },
                },
            },
        };

        if (this.spawnGroup.maxSpawnEnergy < 500) {
            manifest.healer = {
                agentClass: CombatAgent,
                max: () => this.leeroyMax(),
                body: () => [MOVE, HEAL],
                actions: this.combatActions,
            };
            manifest.leeroy.max = () => this.leeroyMax() * 3;
        }
        return manifest;
    };

    // LEEROY

    protected leeroyMax = (): number => {
        let room = Game.rooms[this.targetName];
        if (!room || room.hostiles.length > 0) {
            return 1;
        } else {
            return 0;
        }
    };

    protected leeroyBody = (): string[] => {
        return this.rangerBody(this.getPotency(2));
    };

    // BIG LEE

    protected bigLeeMax = (): number => {
        let room = Game.rooms[this.targetName];
        if (!room || room.hostiles.length === 0) { return 0; }

        let roomRating = this.findRoomRating(room);
        if (roomRating > 180) { return Math.ceil(roomRating / 240); }
    };

    protected bigLeeBody = (): string[] => {
        return this.rangerBody();
    };

    // CREEP BEHAVIOR

    protected idleActions(bodyguard: CombatAgent) {
        this.medicActions(bodyguard);
    }

    private findRoomRating(room: Room): number {
        return _.sum(room.hostiles, x => CreepHelper.rating(x));
    }
}
