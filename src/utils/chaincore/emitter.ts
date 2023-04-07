// // import { EmitterEvent, IEmitterEmit } from "orbiter-chaincore/src/types";
// type EmitterEvent = any;
// type IEmitterEmit = any;
// // const pm2 = require("pm2");
// import pm2 from "pm2";
// pm2.connect(function () {});
//
// function emit(event: EmitterEvent, data: any) {
//   for (let i = 0; i < Number(process.env.INSTANCES || 1); i++) {
//     pm2.sendDataToProcessId(
//       i,
//       {
//         id: i,
//         topic: true,
//         event,
//         data,
//       },
//       function (err: any, msg: any) {
//         console.log("emitter send ===>>", JSON.stringify(msg));
//       },
//     );
//   }
// }
//
// function on(callBack: IEmitterEmit) {
//   process.on("message", function (msg: any) {
//     console.log("emitter receive ===>>", JSON.stringify(msg));
//     const { event, data } = msg;
//     callBack(event, data);
//   });
// }
//
// const emitter = {
//   emit,
//   on,
// };
//
// export default emitter;
