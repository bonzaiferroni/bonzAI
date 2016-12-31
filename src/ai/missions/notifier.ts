export const notifier = {
    add(message: string) {
        console.log(message);
        Memory.notifier.push({time: Game.time, message: message});
    },

    review() {
        for (let value of Memory.notifier) {
            console.log(`${value.time} ${value.message}`)
        }
    },

    clear() {
        Memory.notifier = [];
    }
};