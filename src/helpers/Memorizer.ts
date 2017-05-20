export class Memorizer {

    /**
     * General purpose memorization of gameobjects, works with any host that has a memory property
     * @param host
     * @param identifier
     * @param find
     * @param validate
     * @param delay
     * @returns {any}
     */

    public static findObject<T extends {id: string}>(host: {memory: any}, identifier: string,
                                                     find: () => T, validate?: (obj: T) => boolean, delay?: number): T {
        if (host.memory[identifier]) {
            let obj = Game.getObjectById<T>(host.memory[identifier]);
            if (obj && (!validate || validate(obj))) {
                return obj;
            } else {
                delete host.memory[identifier];
                return Memorizer.findObject<T>(host, identifier, find, validate);
            }
        } else {
            if (Game.time < host.memory[`next_${identifier}`]) { return; }
            let obj = find();
            if (obj) {
                host.memory[identifier] = obj.id;
                return obj;
            } else if (delay !== undefined) {
                host.memory[`next_${identifier}`] = Game.time + delay;
            }
        }
    }
}
