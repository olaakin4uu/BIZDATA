"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = require("pg");
const bcrypt = __importStar(require("bcrypt"));
const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new adapter_pg_1.PrismaPg(pool);
const prisma = new client_1.PrismaClient({ adapter });
async function main() {
    console.log('Seeding BizData...');
    let tenant = await prisma.tenant.findFirst();
    if (!tenant) {
        tenant = await prisma.tenant.create({
            data: {
                name: process.env.TENANT_NAME || 'BizData Demo Tenant',
                shortName: 'BizData',
                contactEmail: 'demo@bizdata.local',
                themeColor: '#0f766e',
            },
        });
        console.log('  Tenant created:', tenant.name);
    }
    else {
        console.log('  Tenant exists:', tenant.name);
    }
    const adminEmail = 'admin@bizdata.local';
    const adminPassword = 'Admin@1234';
    let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!admin) {
        const passwordHash = await bcrypt.hash(adminPassword, 10);
        admin = await prisma.user.create({
            data: {
                email: adminEmail,
                passwordHash,
                firstName: 'Super',
                lastName: 'Admin',
                role: 'SUPER_ADMIN',
                isActive: true,
            },
        });
        console.log(`  Admin created: ${adminEmail} / ${adminPassword}`);
    }
    else {
        console.log(`  Admin exists: ${adminEmail}`);
    }
    const providers = [
        { code: 'CBN-057', name: 'Zenith Bank', type: 'BANK' },
        { code: 'CBN-058', name: 'GTBank', type: 'BANK' },
        { code: 'NCC-OPAY', name: 'Opay', type: 'FINTECH' },
        { code: 'NCC-MTN', name: 'MTN Nigeria', type: 'TELCO' },
        { code: 'CBN-PSTK', name: 'Paystack', type: 'PAYMENT_PROCESSOR' },
    ];
    const providerPassword = 'Provider@1234';
    const providerHash = await bcrypt.hash(providerPassword, 10);
    for (const p of providers) {
        let prov = await prisma.dataProvider.findUnique({ where: { providerCode: p.code } });
        if (!prov) {
            prov = await prisma.dataProvider.create({
                data: {
                    providerCode: p.code,
                    name: p.name,
                    providerType: p.type,
                    status: 'ACTIVE',
                    contactEmail: `compliance@${p.name.toLowerCase().replace(/\s+/g, '')}.local`,
                    reportingFrequency: p.type === 'BANK' ? 'QUARTERLY' : 'MONTHLY',
                },
            });
            console.log(`  Provider created: ${p.name}`);
        }
        const userEmail = `admin@${p.name.toLowerCase().replace(/\s+/g, '')}.local`;
        const existingUser = await prisma.dataProviderUser.findUnique({ where: { email: userEmail } });
        if (!existingUser) {
            await prisma.dataProviderUser.create({
                data: {
                    providerId: prov.id,
                    email: userEmail,
                    passwordHash: providerHash,
                    firstName: 'Provider',
                    lastName: 'Admin',
                    role: 'PROVIDER_ADMIN',
                },
            });
            console.log(`    Provider user: ${userEmail} / ${providerPassword}`);
        }
    }
    const taxpayers = [
        { nin: '12345678901', type: 'INDIVIDUAL', firstName: 'Adamu', lastName: 'Bello', stateOfResidence: 'Kano' },
        { nin: '12345678902', type: 'INDIVIDUAL', firstName: 'Chinwe', lastName: 'Okafor', stateOfResidence: 'Lagos' },
        { nin: '12345678903', type: 'INDIVIDUAL', firstName: 'Tunde', lastName: 'Adekunle', stateOfResidence: 'Oyo' },
        { nin: '12345678904', type: 'INDIVIDUAL', firstName: 'Fatima', lastName: 'Yusuf', stateOfResidence: 'Kaduna' },
        { nin: '12345678905', type: 'INDIVIDUAL', firstName: 'Emeka', lastName: 'Nwosu', stateOfResidence: 'Enugu' },
        { cacRcNumber: 'RC-1001', type: 'CORPORATE', businessName: 'Sahel Trading Ltd', stateOfResidence: 'Kano' },
        { cacRcNumber: 'RC-1002', type: 'CORPORATE', businessName: 'Lagoon Logistics PLC', stateOfResidence: 'Lagos' },
        { cacRcNumber: 'RC-1003', type: 'CORPORATE', businessName: 'Rivers Petroleum Ltd', stateOfResidence: 'Rivers' },
        { cacRcNumber: 'RC-1004', type: 'CORPORATE', businessName: 'Northern Foods Co', stateOfResidence: 'Kaduna' },
        { cacRcNumber: 'RC-1005', type: 'CORPORATE', businessName: 'Capital Tech Holdings', stateOfResidence: 'Abuja' },
    ];
    for (const tp of taxpayers) {
        const where = tp.nin ? { nin: tp.nin } : { cacRcNumber: tp.cacRcNumber };
        let row = await prisma.taxpayer.findFirst({ where });
        if (!row) {
            row = await prisma.taxpayer.create({
                data: {
                    nin: tp.nin || null,
                    cacRcNumber: tp.cacRcNumber || null,
                    type: tp.type,
                    firstName: tp.firstName || null,
                    lastName: tp.lastName || null,
                    businessName: tp.businessName || null,
                    stateOfResidence: tp.stateOfResidence,
                },
            });
        }
        const declared = Math.floor(Math.random() * 50_000_000) + 5_000_000;
        await prisma.declaredIncome.upsert({
            where: { taxpayerId_year: { taxpayerId: row.id, year: 2025 } },
            update: { assessableIncome: new client_1.Prisma.Decimal(declared) },
            create: {
                taxpayerId: row.id,
                year: 2025,
                assessableIncome: new client_1.Prisma.Decimal(declared),
                source: 'MANUAL_IMPORT',
            },
        });
    }
    console.log(`  Taxpayers seeded: ${taxpayers.length}`);
    console.log('Done.');
}
main()
    .catch(err => { console.error(err); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); await pool.end(); });
//# sourceMappingURL=seed.js.map