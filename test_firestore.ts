import * as firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

try {
  let app = firebase.default.initializeApp({projectId: "test"});
  let db2 = app.firestore("my-db");
  console.log("Success with app.firestore(dbId)", db2 !== undefined);
} catch (e) {
  console.log("Failed:", e.message);
}
