# Legal brief — provider late-filing penalties (NTAA 2025)

**Prepared for:** legal / compliance counsel
**Subject:** Two questions the FinData platform's provider-penalty feature depends on
**Primary source:** Nigeria Tax Administration Act, 2025 — Federal Republic of Nigeria *Official Gazette* No. 117, Lagos, 26 June 2025, Vol. 112 (cited below as "the Act"; page markers e.g. "A 280" are the gazette's own pagination). All quotations are verbatim from that gazette.
**Status:** These are open legal-interpretation questions. The platform currently implements a defensible default (see each recommendation), but that default should be confirmed, varied, or rejected by counsel **before any penalty notice is served on a real financial institution.**

---

## 0. Context — what the platform does

FinData is operated by a **State Internal Revenue Service (SIRS)**. It ingests the returns that banks and other financial institutions must file about their customers' high-value transactions, detects late/non-filing, and can **assess an administrative penalty** and **serve a formal demand notice** on the defaulting institution.

Two questions determine whether that penalty step is lawful as built.

---

## Question 1 — Can a **State** IRS assess/collect this penalty against a financial institution (a company)?

### The relevant text

**§29(1) (the reporting obligation), gazette A 280 — verbatim:**
> "For the purposes of tax and without prejudice to section 142 of this Act, every bank, insurance company, stock-broking firm, or any other financial institution, shall prepare, with or without demand **by the Service**, annual returns specifying the names, customer location and transactions of new and existing customers in the case of — (a) an individual, where the cumulative transactions in a month amount to ₦50,000,000.00 or more; or (b) a body corporate … ₦250,000,000.00 or more."

§29(2) then extends a further reporting duty for returns "as may be prescribed … by the **relevant tax authority**".

**§3 (jurisdiction of tax authorities), gazette A 265–266 — verbatim, abridged:**
> "3.—(1) The Nigeria Revenue Service (the Service) … shall — (a) have **exclusive responsibility to administer taxes: (i) on companies** …
> (2) The relevant tax authority in a State or the Federal Capital Territory … shall … be responsible for — (a) the administration of taxes for **resident individuals** …
> (3) A tax authority, with the approval of the relevant government, **may authorise another tax authority to administer taxes within its jurisdiction on its behalf**, on such terms as they may agree."

**Definition — "relevant tax authority" (definitions section):**
> "'relevant tax authority' means Nigeria Revenue Service, the Internal Revenue Service of a State or the Federal Capital Territory in Nigeria."

### The tension

- **Points against a SIRS acting alone:** §29(1)'s core obligation runs to **"the Service"** — i.e. the federal Nigeria Revenue Service (NRS), not the State IRS. And §3(1)(a)(i) gives the NRS **exclusive** responsibility to administer taxes **on companies**. A bank is a company. A penalty *on the institution* is therefore, on its face, within the NRS's exclusive lane — a SIRS purporting to penalise the bank itself risks acting *ultra vires*.
- **Points that leave room for a SIRS:**
  - The data the institution reports concerns **transactions of resident individuals** — squarely the SIRS's §3(2)(a) subject-matter. The SIRS has a legitimate interest in *receiving and using* the data.
  - §29(2) expressly contemplates the **"relevant tax authority"** (which *includes* a State IRS) prescribing and receiving returns.
  - **§3(3) is the decisive escape hatch:** the NRS **may authorise** a State IRS to administer these taxes on its behalf, by agreement. With such an authorisation/delegation in place, a SIRS acting for the NRS is on solid ground.

### Bottom line / recommendation for Q1
A State IRS almost certainly **may receive and act on §29 data** about its resident individuals. Whether it may **assess and serve a penalty on the institution itself** is doubtful **without** either (a) a §3(3) delegation/authorisation from the NRS, or (b) issuing the notice **in the name of / on behalf of the NRS**.

> **Action for counsel:** confirm whether the SIRS holds (or can obtain) a §3(3) authorisation from the NRS to administer §29 institution penalties. If not, the platform should either route the penalty through the NRS, issue it expressly on the NRS's behalf, or disable institution-level penalties and keep only the data-intake/enforcement of the underlying individual liabilities.

---

## Question 2 — Is the correct penalty basis **§101** or **§108**?

### The relevant text

**§101 (Failure to file returns) — verbatim:**
> "A **taxable person** who fails or refuses to file returns or knowingly files incomplete or inaccurate returns to the relevant tax authority in accordance with the provisions of this Act, shall be liable to pay an administrative penalty of — (a) ₦100,000.00 in the first month in which the failure occurs; and (b) ₦50,000.00 for each subsequent month in which the failure continues."

**§108 (Failure to attend to demands, request or notices) — verbatim, abridged:**
> "108.—(1) A person who — (a) fails to comply with the requirements of a notice served under this Act … is liable to an administrative penalty of ₦100,000.00 in the first day of default and ₦10,000 for every subsequent day …
> (2) A person who **fails or refuses to supply information, documents, or records as demanded** … is liable to an administrative penalty of **₦200,000** in the first day of default and ₦10,000 for each subsequent day …
> (3) A person who fails or refuses to comply with obligations to **submit information … as prescribed by notice, rules, regulations, guidelines, or circulars** …"

**Definition — "taxable person":**
> "'taxable person' means person who carries out economic activity … for the purpose of obtaining income … by way of trade or business, or an agency of Government acting in that capacity."

### The tension

- **For §101 (what the platform implements):** the amounts (₦100k first month + ₦50k/month) map cleanly to a *periodic filing* default. A bank *is* a "taxable person" (a company carrying on business), so it is literally within §101's class. This is the most natural fit for "a return that was due and not filed", and the monthly cadence matches a reporting obligation.
- **For §108:** a §29 filing is arguably not the institution's own **"return"** but third-party **"information"** about customers. §108(2)/(3) are keyed precisely to failing to **supply information/records** — including information "prescribed by notice, rules, regulations…", which mirrors §29(2)'s language. §108 is **day-based** and materially **harsher** (e.g. §108(2): ₦200,000 first day + ₦10,000/day), so the characterisation is not academic — it changes the quantum by an order of magnitude.

The pivot is a single characterisation question: **is a §29 filing a "return" (→ §101) or "information" (→ §108)?**

### Bottom line / recommendation for Q2
§101 is a **defensible and conservative** basis (lower quantum, clean fit to "a return not filed"), which is why the platform uses it. But §108 is a **live alternative** that a court or the authority could prefer, especially framing the §29 obligation as an information-supply duty — and it yields a much larger penalty.

> **Action for counsel:** decide the authority's position on characterisation. If §101 → no change needed. If §108 → the penalty engine's rate basis (currently monthly first/subsequent amounts) must be reconfigured to §108's day-based figures; both are already settings-driven in the platform, so this is a configuration change, not a rebuild.

---

## How the platform is built today (so counsel can see what a decision changes)

- **Obligation:** modelled as **§29**; thresholds **₦50m individual / ₦250m corporate**, monthly-cumulative (matches the gazette).
- **Penalty basis:** **§101** — ₦100,000 first month + ₦50,000 each subsequent month. Both amounts, plus a **commencement/effective-from date** and a **payment-window**, are **configurable** in Settings (versioned; every penalty stamps the config version it used).
- **Non-retroactivity:** a period is only penalised if its due date is on/after the configured commencement date.
- **Document:** a formal demand notice cites **both** §29 (obligation) and §101 (penalty), names the authority (the tenant/SIRS), and is served in-app / printable.
- **Nothing is auto-served:** a penalty is only assessed and a notice only issued by a deliberate staff action, and every step is audited.

### What each answer changes
| Decision | Effect on the platform |
|---|---|
| Q1: SIRS **may** penalise (delegation exists / acts for NRS) | No change. Optionally add the delegation/authority reference to the notice. |
| Q1: SIRS **may not** penalise the institution | Route penalties through the NRS, or issue expressly on the NRS's behalf, or disable institution-level penalties. |
| Q2: basis is **§101** | No change. |
| Q2: basis is **§108** | Reconfigure the penalty rate settings to §108's day-based figures (configuration only). |

---

*This brief states the statutory text and the competing readings; it is not legal advice and does not bind the authority. Please confirm the two positions above before the feature is used to assess or serve penalties on a live financial institution.*
