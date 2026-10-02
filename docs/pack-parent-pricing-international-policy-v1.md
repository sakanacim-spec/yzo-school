# 1. Règles déjà validées

- Direction/établissement : gratuit pour toujours. Distinguer explicitement l'ancien abonnement SaaS des établissements, désormais retiré, du nouveau Pack Parent payé par les parents. Les anciens chiffres peuvent être réutilisés comme tarifs Pack Parent, mais ne doivent plus servir à facturer une école.
- Pack Parent : payé par enfant. Le parent choisit soit un paiement mensuel manuel, soit un paiement annuel en une seule tranche. Aucun prélèvement automatique récurrent n'est introduit en V1.
- Tous les paiements Pack Parent sont encaissés d'abord par YZIOW via son prestataire de paiement. Les établissements ne reçoivent pas directement le paiement des parents.
- YZIOW absorbe les frais de collecte FedaPay et les frais de reversement.
- L'établissement reçoit sa commission complète : les frais prestataire ne diminuent jamais la commission de l'établissement ni celle de l'ambassadeur.
- La part économique restante de YZIOW est le montant payé moins les commissions établissement et ambassadeur, puis moins les frais réellement supportés par YZIOW.
- Renouvellement manuel ; paiement anticipé = nouvelle période `scheduled`.
- Paiement confirmé pendant la grâce = nouvelle période qui commence le jour du paiement ; la grâce précédente se termine ce jour-là.
- Seuil de reversement : 2 000 FCFA conservé.

# 2. Matrice tarifaire V1 (Zone XOF)

La durée annuelle facturée est de 10 mois scolaires pour ces trois cycles. Il n'existe aucune réduction annuelle supplémentaire : le prix annuel est exactement 10 fois le prix mensuel.

| Cycle scolaire | Prix mensuel par enfant | Prix annuel (10 mois) | Commission établissement | Commission ambassadeur | Prestataire | Statut |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Maternelle / Primaire | 100 FCFA | 1 000 FCFA | 20 % du brut | 10 % du brut | FedaPay | VALIDÉ |
| Collège / Secondaire | 150 FCFA | 1 500 FCFA | 20 % du brut | 10 % du brut | FedaPay | VALIDÉ |
| Supérieur / Formation | 200 FCFA | 2 000 FCFA | 20 % du brut | 10 % du brut | FedaPay | VALIDÉ |

# 3. Règles internationales et futures devises

- Les anciens montants internationaux restent conservés comme références commerciales futures :
  - Afrique hors XOF : 0,50 USD ; 0,75 USD ; 1 USD.
  - International EUR/USD : 1 ; 1,50 ; 2 EUR ou USD.
- Ils ne sont pas actifs en V1 et ne doivent pas être affichés comme payables maintenant. La V1 active reste limitée aux transactions XOF.
- L'ouverture effective des prix en USD/EUR dépendra d'un futur prestataire de paiement international, de la gestion des remboursements, des reversements, de la conformité locale et d'une migration additive distincte.
- Ne jamais modifier l'historique XOF existant lors de cette future évolution.

# 4. Formules financières et d'acquisition

- Prix année scolaire = prix mensuel × 10.
- Commission établissement = 20 % du montant brut effectivement payé.
- Commission ambassadeur = 10 % du montant brut effectivement payé.
- Montant net YZIOW = prix brut − commission établissement − commission ambassadeur − frais réels de collecte et de reversement.
- Pour un paiement annuel en une tranche, les commissions école et ambassadeur sont acquises mensuellement à raison de 1/10 par mois scolaire, et non intégralement au jour du paiement.

# 5. Règle ambassadeur à vie

- L'ambassadeur attribué à un établissement reçoit sa commission sur chaque mois Pack Parent effectivement payé pour cet établissement, sans date d'expiration arbitraire.
- L'attribution doit être unique, traçable et non modifiable rétroactivement, sauf procédure interne d'anti-fraude documentée.
- Une commission n'est jamais acquise pour un paiement annulé, remboursé ou contesté.
- Toute contrepassation doit être enregistrée dans les journaux financiers existants ou futurs ; aucune suppression d'historique.

# 6. Évolutions techniques à concevoir

Les points techniques restant à concevoir (non inclus dans les migrations existantes) :
- Table/configuration tarifaire par cycle.
- Attribution durable de l'ambassadeur.
- Acquisition mensuelle des commissions annuelles.
- Futur multi-devise et changement de prestataire.
