const fs = require('fs');

const fixFunctions = [
    {
        file: 'components/BarcodeScanner.tsx',
        replacements: [
            [/(videoConstraints\.advanced\.push\(\{ zoom: zoomLevel \}\);)/g, '// @ts-ignore\n    $1']
        ]
    },
    {
        file: 'components/CatalogModal.tsx',
        replacements: [
            [/import \{[^}]+\} from 'firebase\/firestore';/g, "$&\nimport { ref, deleteObject } from 'firebase/storage';\nimport { storage } from '../services/firebaseConfig';"],
            [/await db\.collection\('reviews'\)\.doc\(reviewId\)\.delete\(\);/g, "await deleteDoc(doc(modularDb, 'reviews', reviewId));"],
            [/await storage\.refFromURL\(url\)\.delete\(\);/g, "await deleteObject(ref(storage, url));"]
        ]
    },
    {
        file: 'components/CategoriesTab.tsx',
        replacements: [
            [/import \{[^}]+\} from 'firebase\/firestore';/g, "$&\nimport { ref, deleteObject } from 'firebase/storage';\nimport { storage } from '../services/firebaseConfig';"],
            [/await storage\.refFromURL\(cat\.image\)\.delete\(\);/g, "await deleteObject(ref(storage, cat.image));"]
        ]
    },
    {
        file: 'components/ClientArea.tsx',
        replacements: [
            [/import \{[^}]+\} from 'firebase\/firestore';/g, "$&\nimport { ref, deleteObject } from 'firebase/storage';\nimport { storage } from '../services/firebaseConfig';"],
            [/await storage\.refFromURL\(url\)\.delete\(\);/g, "await deleteObject(ref(storage, url));"],
            [/batch\.update\(ticketDoc\.ref,/g, "batch.update(doc(modularDb, 'support_tickets', ticketDoc.id),"]
        ]
    },
    {
        file: 'components/ClientDetailsModal.tsx',
        replacements: [
            [/LOYALTY_REWARDS/g, "LOYALTY_TIERS"],
            [/setIsRedeeming\(false\);/g, ""],
            [/const newCoupon: Coupon = \{/g, "const newCoupon: any = {"]
        ]
    },
    {
        file: 'components/Dashboard.tsx',
        replacements: [
            [/import \{[^}]+\} from 'firebase\/firestore';/g, "$&\nimport { ref, deleteObject } from 'firebase/storage';\nimport { storage } from '../services/firebaseConfig';"],
            [/await firebase\.storage\(\)\.refFromURL\(img\)\.delete\(\);/g, "await deleteObject(ref(storage, img));"]
        ]
    },
    {
        file: 'components/ImportsTab.tsx',
        replacements: [
            [/const docRef = \w+\(collection\(modularDb, 'import_shipments'\), newShipment\);/g, "const docRef = addDoc(collection(modularDb, 'import_shipments'), newShipment as any);"]
        ]
    },
    {
        file: 'components/LoginModal.tsx',
        replacements: [
            [/import \{[^}]+\} from 'firebase\/firestore';/g, "$&\nimport { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';"]
        ]
    },
    {
        file: 'components/ResetPasswordModal.tsx',
        replacements: [
            [/import \{[^}]+\} from 'firebase\/firestore';/g, "$&\nimport { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';"]
        ]
    },
    {
        file: 'components/OrderFulfillmentModal.tsx',
        replacements: [
            [/runTransaction\(modularDb, async \(transaction\) => \{/g, "runTransaction(modularDb, async (transaction) => {"],
            [/const orderDoc = await transaction\.get\(orderRef\);/g, "const orderDoc = await transaction.get(orderRef);"],
            [/orderDoc\.exists(?!(\(|\.))/g, "orderDoc.exists()"]
        ]
    },
    {
        file: 'services/analyticsService.ts',
        replacements: [
             [/batch\.set\(statsRef, newStats\);/g, "batch.set(statsRef, newStats as any);"],
             [/batch\.update\(statsRef, \{\n\s+totalVisits: increment\(1\),\n\s+\[\`locations\.\$\{country\}\`\]: increment\(1\),\n\s+lastUpdated: serverTimestamp\(\)\n\s+\}\);/g, "batch.update(statsRef, { totalVisits: increment(1), [`locations.${country}`]: increment(1), lastUpdated: serverTimestamp() } as any);"]
        ]
    }
];

fixFunctions.forEach(({file, replacements}) => {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    for (const [pattern, repl] of replacements) {
        content = content.replace(pattern, repl);
    }
    fs.writeFileSync(file, content);
});

console.log("Fixes applied!");
