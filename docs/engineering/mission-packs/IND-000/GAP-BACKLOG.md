# IND-000 — Research gap backlog (input to future PB content missions)

Generated from the 57 `industry_gap` records at register base commit `4807127`.
Each gap is a declared research item: no fee, form, or deadline was asserted.
Closing a gap means researching the obligation from official sources and,
where confirmed, promoting it into Black Book records via a PB-000-series
mission (which then lets the industry packs upgrade their links from gap to
verified cross-reference).

| # | Gap | Industries affected | Related existing authority records | Proposed Black Book category |
| --- | --- | --- | --- | --- |
| 1 | AML/CFT obligations | financial-services | rbz | `compliance_event` |
| 2 | Additional farmer unions | agriculture | — | `business_association` |
| 3 | Agricultural Marketing Authority (AMA) registration | agriculture | ministry-lands-agriculture-fisheries | `regulator` |
| 4 | Audit and accountancy regulation | professional-services | — | `regulator` |
| 5 | Auditor-General audit obligations | public-sector | — | `government_organisation` |
| 6 | Banking and deposit-taking licence classes | financial-services | rbz | `licence_type` |
| 7 | Chamber of Mines membership | mining | — | `business_association` |
| 8 | Client trust account rules | professional-services | — | `compliance_event` |
| 9 | Construction industry federation membership | construction | — | `business_association` |
| 10 | Contract withholding tax and tax clearance (ITF 263) | construction | zimra | `compliance_event` |
| 11 | Controlled substances registers | healthcare | mcaz | `compliance_event` |
| 12 | Council registration of school premises | education | harare-city-council, bulawayo-city-council | `compliance_event` |
| 13 | Cross-border transit and abnormal-load permits | logistics | ministry-transport-infrastructural-development | `compliance_event` |
| 14 | Customs clearing agent licensing (ZIMRA) | logistics | zimra | `licence_type` |
| 15 | Engineering and built-environment councils | professional-services | — | `regulator` |
| 16 | Estate agents registration | professional-services | — | `regulator` |
| 17 | Excise duties on excisable products | manufacturing | zimra | `compliance_event` |
| 18 | Explosives and blasting licensing | mining | — | `licence_type` |
| 19 | Factory registration and occupational safety inspection | manufacturing | nssa | `licence_type` |
| 20 | Fiscalisation of VAT-registered retailers | retail | zimra | `compliance_event` |
| 21 | Food handlers' medical certificates | hospitality | harare-city-council, bulawayo-city-council | `compliance_event` |
| 22 | Food manufacturing safety obligations | manufacturing | ministry-health-child-care | `compliance_event` |
| 23 | Freight and transport associations | logistics | — | `business_association` |
| 24 | Goods and passenger operator permits | logistics | ministry-transport-infrastructural-development | `licence_type` |
| 25 | Health facility licensing | healthcare | ministry-health-child-care | `licence_type` |
| 26 | Hospitality sector association | hospitality | — | `business_association` |
| 27 | Independent school and ECD centre registration | education | ministry-primary-secondary-education | `licence_type` |
| 28 | Insurance and pensions registration classes | financial-services | ipec | `licence_type` |
| 29 | Legal practice registration and practising certificates | professional-services | ministry-justice-legal-parliamentary-affairs | `regulator` |
| 30 | Livestock movement and veterinary permits | agriculture | ministry-lands-agriculture-fisheries | `licence_type` |
| 31 | Medical waste handling obligations | healthcare | ema | `compliance_event` |
| 32 | Medical-aid society regulation and provider contracting | healthcare | — | `regulator` |
| 33 | Microfinance registration | financial-services | rbz | `licence_type` |
| 34 | Mine health and safety inspection regime | mining | ministry-mines-mining-development | `compliance_event` |
| 35 | Mineral marketing and royalty obligations | mining | ministry-mines-mining-development | `regulator` |
| 36 | Mining titles, claims and leases (Ministry of Mines) | mining | ministry-mines-mining-development | `licence_type` |
| 37 | Municipal building plan approval and inspections | construction | harare-city-council, bulawayo-city-council | `licence_type` |
| 38 | NGO coordination bodies | ngo | — | `business_association` |
| 39 | National Employment Council for the construction industry | construction | — | `regulator` |
| 40 | National examinations centre registration | education | ministry-primary-secondary-education | `compliance_event` |
| 41 | Non-profit tax status and exemptions | ngo | zimra | `compliance_event` |
| 42 | Payment systems and money-transfer authorisations | financial-services | rbz | `licence_type` |
| 43 | Presumptive taxes for informal traders | retail | zimra | `compliance_event` |
| 44 | Private voluntary organisation (PVO) registration | ngo | ministry-public-service-labour-social-welfare | `licence_type` |
| 45 | Product standards and certification (SAZ) | manufacturing | — | `regulator` |
| 46 | Professional practitioner registration councils | healthcare | ministry-health-child-care | `regulator` |
| 47 | Public entity corporate governance obligations | public-sector | — | `compliance_event` |
| 48 | Public financial management obligations | public-sector | ministry-finance-investment-promotion | `compliance_event` |
| 49 | Public-works contractor registration/categorisation | construction | ministry-local-government-public-works | `licence_type` |
| 50 | Securities licence categories | financial-services | seczim | `licence_type` |
| 51 | Tertiary institution registration and accreditation | education | ministry-higher-tertiary-education | `licence_type` |
| 52 | Tobacco Industry and Marketing Board (TIMB) licensing | agriculture | ministry-lands-agriculture-fisheries | `regulator` |
| 53 | Tourism authority registration and grading | hospitality | ministry-tourism-hospitality | `licence_type` |
| 54 | VAT treatment of agricultural produce and inputs | agriculture | zimra | `compliance_event` |
| 55 | Vehicle licensing, registration and inspection | logistics | ministry-transport-infrastructural-development | `licence_type` |
| 56 | Vocational training centre registration and trade testing | education | ministry-higher-tertiary-education | `licence_type` |
| 57 | Water abstraction and irrigation permits (ZINWA) | agriculture | ministry-lands-agriculture-fisheries | `licence_type` |

## Suggested mission slicing

Grouping the backlog into coherent research missions (sequencing per owner priority):

1. **PB-00x Tax administration extras** — presumptive tax, fiscalisation, ITF 263 withholding/tax clearance, excise, non-profit tax treatment, VAT treatment of produce (all ZIMRA-anchored).
2. **PB-00x Sector marketing and land authorities (agriculture)** — AMA, TIMB, veterinary/movement permits, ZINWA abstraction permits, farmer unions.
3. **PB-00x Mining title and safety regime** — mining titles/claims/leases, mineral marketing and royalties, explosives, mine safety, Chamber of Mines.
4. **PB-00x Health professions and facilities** — facility licensing, practitioner councils, medical-aid regulation, medical waste, controlled substances.
5. **PB-00x Built environment and works** — council plan approval, contractor registration/categorisation, construction NEC and federation.
6. **PB-00x Financial-sector licensing** — banking/deposit-taking classes, microfinance, insurance/pensions classes, securities categories, payments/money transfer, AML/CFT.
7. **PB-00x Transport and trade logistics** — vehicle licensing/inspection, operator permits, clearing agents, cross-border/transit permits, freight associations.
8. **PB-00x Education and training registration** — school/ECD registration, tertiary accreditation, vocational registration, exams-centre registration, council premises for schools.
9. **PB-00x Tourism, standards and factories** — tourism registration/grading and levy, hospitality association, food handlers' certificates, SAZ standards, factory registration, food-safety registration.
10. **PB-00x Civil society and public accountability** — PVO registration, NGO coordination bodies, PFM obligations, Auditor-General entry and audit obligations, public-entity corporate governance, professional trust-account rules, estate agents, audit/accountancy and engineering councils, Law Society.

Coverage check: 57 gap records across 13 industries; 57 distinct gap topics; 110 regulatory links already evidenced.
