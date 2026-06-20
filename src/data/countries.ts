// ============================================================
// LISTE COMPLÈTE DES PAYS DU MONDE (FR + EN)
// ============================================================

export interface Country {
  code: string;      // ISO 3166-1 alpha-2
  name_fr: string;
  name_en: string;
  dialCode: string;  // Indicatif téléphonique
  flag: string;      // Emoji drapeau
}

export const COUNTRIES: Country[] = [
  { code: 'AF', name_fr: 'Afghanistan', name_en: 'Afghanistan', dialCode: '+93', flag: '🇦🇫' },
  { code: 'ZA', name_fr: 'Afrique du Sud', name_en: 'South Africa', dialCode: '+27', flag: '🇿🇦' },
  { code: 'AL', name_fr: 'Albanie', name_en: 'Albania', dialCode: '+355', flag: '🇦🇱' },
  { code: 'DZ', name_fr: 'Algérie', name_en: 'Algeria', dialCode: '+213', flag: '🇩🇿' },
  { code: 'DE', name_fr: 'Allemagne', name_en: 'Germany', dialCode: '+49', flag: '🇩🇪' },
  { code: 'AD', name_fr: 'Andorre', name_en: 'Andorra', dialCode: '+376', flag: '🇦🇩' },
  { code: 'AO', name_fr: 'Angola', name_en: 'Angola', dialCode: '+244', flag: '🇦🇴' },
  { code: 'AG', name_fr: 'Antigua-et-Barbuda', name_en: 'Antigua and Barbuda', dialCode: '+1268', flag: '🇦🇬' },
  { code: 'SA', name_fr: 'Arabie Saoudite', name_en: 'Saudi Arabia', dialCode: '+966', flag: '🇸🇦' },
  { code: 'AR', name_fr: 'Argentine', name_en: 'Argentina', dialCode: '+54', flag: '🇦🇷' },
  { code: 'AM', name_fr: 'Arménie', name_en: 'Armenia', dialCode: '+374', flag: '🇦🇲' },
  { code: 'AU', name_fr: 'Australie', name_en: 'Australia', dialCode: '+61', flag: '🇦🇺' },
  { code: 'AT', name_fr: 'Autriche', name_en: 'Austria', dialCode: '+43', flag: '🇦🇹' },
  { code: 'AZ', name_fr: 'Azerbaïdjan', name_en: 'Azerbaijan', dialCode: '+994', flag: '🇦🇿' },
  { code: 'BS', name_fr: 'Bahamas', name_en: 'Bahamas', dialCode: '+1242', flag: '🇧🇸' },
  { code: 'BH', name_fr: 'Bahreïn', name_en: 'Bahrain', dialCode: '+973', flag: '🇧🇭' },
  { code: 'BD', name_fr: 'Bangladesh', name_en: 'Bangladesh', dialCode: '+880', flag: '🇧🇩' },
  { code: 'BB', name_fr: 'Barbade', name_en: 'Barbados', dialCode: '+1246', flag: '🇧🇧' },
  { code: 'BE', name_fr: 'Belgique', name_en: 'Belgium', dialCode: '+32', flag: '🇧🇪' },
  { code: 'BZ', name_fr: 'Belize', name_en: 'Belize', dialCode: '+501', flag: '🇧🇿' },
  { code: 'BJ', name_fr: 'Bénin', name_en: 'Benin', dialCode: '+229', flag: '🇧🇯' },
  { code: 'BT', name_fr: 'Bhoutan', name_en: 'Bhutan', dialCode: '+975', flag: '🇧🇹' },
  { code: 'BY', name_fr: 'Biélorussie', name_en: 'Belarus', dialCode: '+375', flag: '🇧🇾' },
  { code: 'BO', name_fr: 'Bolivie', name_en: 'Bolivia', dialCode: '+591', flag: '🇧🇴' },
  { code: 'BA', name_fr: 'Bosnie-Herzégovine', name_en: 'Bosnia and Herzegovina', dialCode: '+387', flag: '🇧🇦' },
  { code: 'BW', name_fr: 'Botswana', name_en: 'Botswana', dialCode: '+267', flag: '🇧🇼' },
  { code: 'BR', name_fr: 'Brésil', name_en: 'Brazil', dialCode: '+55', flag: '🇧🇷' },
  { code: 'BN', name_fr: 'Brunéi', name_en: 'Brunei', dialCode: '+673', flag: '🇧🇳' },
  { code: 'BG', name_fr: 'Bulgarie', name_en: 'Bulgaria', dialCode: '+359', flag: '🇧🇬' },
  { code: 'BF', name_fr: 'Burkina Faso', name_en: 'Burkina Faso', dialCode: '+226', flag: '🇧🇫' },
  { code: 'BI', name_fr: 'Burundi', name_en: 'Burundi', dialCode: '+257', flag: '🇧🇮' },
  { code: 'CV', name_fr: 'Cabo Verde', name_en: 'Cape Verde', dialCode: '+238', flag: '🇨🇻' },
  { code: 'KH', name_fr: 'Cambodge', name_en: 'Cambodia', dialCode: '+855', flag: '🇰🇭' },
  { code: 'CM', name_fr: 'Cameroun', name_en: 'Cameroon', dialCode: '+237', flag: '🇨🇲' },
  { code: 'CA', name_fr: 'Canada', name_en: 'Canada', dialCode: '+1', flag: '🇨🇦' },
  { code: 'CF', name_fr: 'République Centrafricaine', name_en: 'Central African Republic', dialCode: '+236', flag: '🇨🇫' },
  { code: 'CL', name_fr: 'Chili', name_en: 'Chile', dialCode: '+56', flag: '🇨🇱' },
  { code: 'CN', name_fr: 'Chine', name_en: 'China', dialCode: '+86', flag: '🇨🇳' },
  { code: 'CY', name_fr: 'Chypre', name_en: 'Cyprus', dialCode: '+357', flag: '🇨🇾' },
  { code: 'CO', name_fr: 'Colombie', name_en: 'Colombia', dialCode: '+57', flag: '🇨🇴' },
  { code: 'KM', name_fr: 'Comores', name_en: 'Comoros', dialCode: '+269', flag: '🇰🇲' },
  { code: 'CG', name_fr: 'Congo', name_en: 'Congo', dialCode: '+242', flag: '🇨🇬' },
  { code: 'CD', name_fr: 'RD Congo', name_en: 'DR Congo', dialCode: '+243', flag: '🇨🇩' },
  { code: 'KP', name_fr: 'Corée du Nord', name_en: 'North Korea', dialCode: '+850', flag: '🇰🇵' },
  { code: 'KR', name_fr: 'Corée du Sud', name_en: 'South Korea', dialCode: '+82', flag: '🇰🇷' },
  { code: 'CR', name_fr: 'Costa Rica', name_en: 'Costa Rica', dialCode: '+506', flag: '🇨🇷' },
  { code: 'CI', name_fr: "Côte d'Ivoire", name_en: "Côte d'Ivoire", dialCode: '+225', flag: '🇨🇮' },
  { code: 'HR', name_fr: 'Croatie', name_en: 'Croatia', dialCode: '+385', flag: '🇭🇷' },
  { code: 'CU', name_fr: 'Cuba', name_en: 'Cuba', dialCode: '+53', flag: '🇨🇺' },
  { code: 'DK', name_fr: 'Danemark', name_en: 'Denmark', dialCode: '+45', flag: '🇩🇰' },
  { code: 'DJ', name_fr: 'Djibouti', name_en: 'Djibouti', dialCode: '+253', flag: '🇩🇯' },
  { code: 'DO', name_fr: 'République Dominicaine', name_en: 'Dominican Republic', dialCode: '+1809', flag: '🇩🇴' },
  { code: 'EG', name_fr: 'Égypte', name_en: 'Egypt', dialCode: '+20', flag: '🇪🇬' },
  { code: 'AE', name_fr: 'Émirats Arabes Unis', name_en: 'United Arab Emirates', dialCode: '+971', flag: '🇦🇪' },
  { code: 'EC', name_fr: 'Équateur', name_en: 'Ecuador', dialCode: '+593', flag: '🇪🇨' },
  { code: 'ER', name_fr: 'Érythrée', name_en: 'Eritrea', dialCode: '+291', flag: '🇪🇷' },
  { code: 'ES', name_fr: 'Espagne', name_en: 'Spain', dialCode: '+34', flag: '🇪🇸' },
  { code: 'EE', name_fr: 'Estonie', name_en: 'Estonia', dialCode: '+372', flag: '🇪🇪' },
  { code: 'SZ', name_fr: 'Eswatini', name_en: 'Eswatini', dialCode: '+268', flag: '🇸🇿' },
  { code: 'ET', name_fr: 'Éthiopie', name_en: 'Ethiopia', dialCode: '+251', flag: '🇪🇹' },
  { code: 'FJ', name_fr: 'Fidji', name_en: 'Fiji', dialCode: '+679', flag: '🇫🇯' },
  { code: 'FI', name_fr: 'Finlande', name_en: 'Finland', dialCode: '+358', flag: '🇫🇮' },
  { code: 'FR', name_fr: 'France', name_en: 'France', dialCode: '+33', flag: '🇫🇷' },
  { code: 'GA', name_fr: 'Gabon', name_en: 'Gabon', dialCode: '+241', flag: '🇬🇦' },
  { code: 'GM', name_fr: 'Gambie', name_en: 'Gambia', dialCode: '+220', flag: '🇬🇲' },
  { code: 'GE', name_fr: 'Géorgie', name_en: 'Georgia', dialCode: '+995', flag: '🇬🇪' },
  { code: 'GH', name_fr: 'Ghana', name_en: 'Ghana', dialCode: '+233', flag: '🇬🇭' },
  { code: 'GR', name_fr: 'Grèce', name_en: 'Greece', dialCode: '+30', flag: '🇬🇷' },
  { code: 'GD', name_fr: 'Grenade', name_en: 'Grenada', dialCode: '+1473', flag: '🇬🇩' },
  { code: 'GT', name_fr: 'Guatemala', name_en: 'Guatemala', dialCode: '+502', flag: '🇬🇹' },
  { code: 'GN', name_fr: 'Guinée', name_en: 'Guinea', dialCode: '+224', flag: '🇬🇳' },
  { code: 'GW', name_fr: 'Guinée-Bissau', name_en: 'Guinea-Bissau', dialCode: '+245', flag: '🇬🇼' },
  { code: 'GQ', name_fr: 'Guinée équatoriale', name_en: 'Equatorial Guinea', dialCode: '+240', flag: '🇬🇶' },
  { code: 'GY', name_fr: 'Guyana', name_en: 'Guyana', dialCode: '+592', flag: '🇬🇾' },
  { code: 'HT', name_fr: 'Haïti', name_en: 'Haiti', dialCode: '+509', flag: '🇭🇹' },
  { code: 'HN', name_fr: 'Honduras', name_en: 'Honduras', dialCode: '+504', flag: '🇭🇳' },
  { code: 'HU', name_fr: 'Hongrie', name_en: 'Hungary', dialCode: '+36', flag: '🇭🇺' },
  { code: 'IN', name_fr: 'Inde', name_en: 'India', dialCode: '+91', flag: '🇮🇳' },
  { code: 'ID', name_fr: 'Indonésie', name_en: 'Indonesia', dialCode: '+62', flag: '🇮🇩' },
  { code: 'IQ', name_fr: 'Irak', name_en: 'Iraq', dialCode: '+964', flag: '🇮🇶' },
  { code: 'IR', name_fr: 'Iran', name_en: 'Iran', dialCode: '+98', flag: '🇮🇷' },
  { code: 'IE', name_fr: 'Irlande', name_en: 'Ireland', dialCode: '+353', flag: '🇮🇪' },
  { code: 'IS', name_fr: 'Islande', name_en: 'Iceland', dialCode: '+354', flag: '🇮🇸' },
  { code: 'IL', name_fr: 'Israël', name_en: 'Israel', dialCode: '+972', flag: '🇮🇱' },
  { code: 'IT', name_fr: 'Italie', name_en: 'Italy', dialCode: '+39', flag: '🇮🇹' },
  { code: 'JM', name_fr: 'Jamaïque', name_en: 'Jamaica', dialCode: '+1876', flag: '🇯🇲' },
  { code: 'JP', name_fr: 'Japon', name_en: 'Japan', dialCode: '+81', flag: '🇯🇵' },
  { code: 'JO', name_fr: 'Jordanie', name_en: 'Jordan', dialCode: '+962', flag: '🇯🇴' },
  { code: 'KZ', name_fr: 'Kazakhstan', name_en: 'Kazakhstan', dialCode: '+7', flag: '🇰🇿' },
  { code: 'KE', name_fr: 'Kenya', name_en: 'Kenya', dialCode: '+254', flag: '🇰🇪' },
  { code: 'KG', name_fr: 'Kirghizistan', name_en: 'Kyrgyzstan', dialCode: '+996', flag: '🇰🇬' },
  { code: 'KI', name_fr: 'Kiribati', name_en: 'Kiribati', dialCode: '+686', flag: '🇰🇮' },
  { code: 'KW', name_fr: 'Koweït', name_en: 'Kuwait', dialCode: '+965', flag: '🇰🇼' },
  { code: 'LA', name_fr: 'Laos', name_en: 'Laos', dialCode: '+856', flag: '🇱🇦' },
  { code: 'LS', name_fr: 'Lesotho', name_en: 'Lesotho', dialCode: '+266', flag: '🇱🇸' },
  { code: 'LV', name_fr: 'Lettonie', name_en: 'Latvia', dialCode: '+371', flag: '🇱🇻' },
  { code: 'LB', name_fr: 'Liban', name_en: 'Lebanon', dialCode: '+961', flag: '🇱🇧' },
  { code: 'LR', name_fr: 'Liberia', name_en: 'Liberia', dialCode: '+231', flag: '🇱🇷' },
  { code: 'LY', name_fr: 'Libye', name_en: 'Libya', dialCode: '+218', flag: '🇱🇾' },
  { code: 'LI', name_fr: 'Liechtenstein', name_en: 'Liechtenstein', dialCode: '+423', flag: '🇱🇮' },
  { code: 'LT', name_fr: 'Lituanie', name_en: 'Lithuania', dialCode: '+370', flag: '🇱🇹' },
  { code: 'LU', name_fr: 'Luxembourg', name_en: 'Luxembourg', dialCode: '+352', flag: '🇱🇺' },
  { code: 'MG', name_fr: 'Madagascar', name_en: 'Madagascar', dialCode: '+261', flag: '🇲🇬' },
  { code: 'MW', name_fr: 'Malawi', name_en: 'Malawi', dialCode: '+265', flag: '🇲🇼' },
  { code: 'MY', name_fr: 'Malaisie', name_en: 'Malaysia', dialCode: '+60', flag: '🇲🇾' },
  { code: 'MV', name_fr: 'Maldives', name_en: 'Maldives', dialCode: '+960', flag: '🇲🇻' },
  { code: 'ML', name_fr: 'Mali', name_en: 'Mali', dialCode: '+223', flag: '🇲🇱' },
  { code: 'MT', name_fr: 'Malte', name_en: 'Malta', dialCode: '+356', flag: '🇲🇹' },
  { code: 'MA', name_fr: 'Maroc', name_en: 'Morocco', dialCode: '+212', flag: '🇲🇦' },
  { code: 'MH', name_fr: 'Marshall', name_en: 'Marshall Islands', dialCode: '+692', flag: '🇲🇭' },
  { code: 'MR', name_fr: 'Mauritanie', name_en: 'Mauritania', dialCode: '+222', flag: '🇲🇷' },
  { code: 'MU', name_fr: 'Maurice', name_en: 'Mauritius', dialCode: '+230', flag: '🇲🇺' },
  { code: 'MX', name_fr: 'Mexique', name_en: 'Mexico', dialCode: '+52', flag: '🇲🇽' },
  { code: 'FM', name_fr: 'Micronésie', name_en: 'Micronesia', dialCode: '+691', flag: '🇫🇲' },
  { code: 'MD', name_fr: 'Moldavie', name_en: 'Moldova', dialCode: '+373', flag: '🇲🇩' },
  { code: 'MC', name_fr: 'Monaco', name_en: 'Monaco', dialCode: '+377', flag: '🇲🇨' },
  { code: 'MN', name_fr: 'Mongolie', name_en: 'Mongolia', dialCode: '+976', flag: '🇲🇳' },
  { code: 'ME', name_fr: 'Monténégro', name_en: 'Montenegro', dialCode: '+382', flag: '🇲🇪' },
  { code: 'MZ', name_fr: 'Mozambique', name_en: 'Mozambique', dialCode: '+258', flag: '🇲🇿' },
  { code: 'MM', name_fr: 'Myanmar', name_en: 'Myanmar', dialCode: '+95', flag: '🇲🇲' },
  { code: 'NA', name_fr: 'Namibie', name_en: 'Namibia', dialCode: '+264', flag: '🇳🇦' },
  { code: 'NR', name_fr: 'Nauru', name_en: 'Nauru', dialCode: '+674', flag: '🇳🇷' },
  { code: 'NP', name_fr: 'Népal', name_en: 'Nepal', dialCode: '+977', flag: '🇳🇵' },
  { code: 'NI', name_fr: 'Nicaragua', name_en: 'Nicaragua', dialCode: '+505', flag: '🇳🇮' },
  { code: 'NE', name_fr: 'Niger', name_en: 'Niger', dialCode: '+227', flag: '🇳🇪' },
  { code: 'NG', name_fr: 'Nigeria', name_en: 'Nigeria', dialCode: '+234', flag: '🇳🇬' },
  { code: 'NO', name_fr: 'Norvège', name_en: 'Norway', dialCode: '+47', flag: '🇳🇴' },
  { code: 'NZ', name_fr: 'Nouvelle-Zélande', name_en: 'New Zealand', dialCode: '+64', flag: '🇳🇿' },
  { code: 'OM', name_fr: 'Oman', name_en: 'Oman', dialCode: '+968', flag: '🇴🇲' },
  { code: 'UG', name_fr: 'Ouganda', name_en: 'Uganda', dialCode: '+256', flag: '🇺🇬' },
  { code: 'UZ', name_fr: 'Ouzbékistan', name_en: 'Uzbekistan', dialCode: '+998', flag: '🇺🇿' },
  { code: 'PK', name_fr: 'Pakistan', name_en: 'Pakistan', dialCode: '+92', flag: '🇵🇰' },
  { code: 'PW', name_fr: 'Palaos', name_en: 'Palau', dialCode: '+680', flag: '🇵🇼' },
  { code: 'PA', name_fr: 'Panama', name_en: 'Panama', dialCode: '+507', flag: '🇵🇦' },
  { code: 'PG', name_fr: 'Papouasie-Nouvelle-Guinée', name_en: 'Papua New Guinea', dialCode: '+675', flag: '🇵🇬' },
  { code: 'PY', name_fr: 'Paraguay', name_en: 'Paraguay', dialCode: '+595', flag: '🇵🇾' },
  { code: 'NL', name_fr: 'Pays-Bas', name_en: 'Netherlands', dialCode: '+31', flag: '🇳🇱' },
  { code: 'PE', name_fr: 'Pérou', name_en: 'Peru', dialCode: '+51', flag: '🇵🇪' },
  { code: 'PH', name_fr: 'Philippines', name_en: 'Philippines', dialCode: '+63', flag: '🇵🇭' },
  { code: 'PL', name_fr: 'Pologne', name_en: 'Poland', dialCode: '+48', flag: '🇵🇱' },
  { code: 'PT', name_fr: 'Portugal', name_en: 'Portugal', dialCode: '+351', flag: '🇵🇹' },
  { code: 'QA', name_fr: 'Qatar', name_en: 'Qatar', dialCode: '+974', flag: '🇶🇦' },
  { code: 'RO', name_fr: 'Roumanie', name_en: 'Romania', dialCode: '+40', flag: '🇷🇴' },
  { code: 'GB', name_fr: 'Royaume-Uni', name_en: 'United Kingdom', dialCode: '+44', flag: '🇬🇧' },
  { code: 'RU', name_fr: 'Russie', name_en: 'Russia', dialCode: '+7', flag: '🇷🇺' },
  { code: 'RW', name_fr: 'Rwanda', name_en: 'Rwanda', dialCode: '+250', flag: '🇷🇼' },
  { code: 'KN', name_fr: 'Saint-Kitts-et-Nevis', name_en: 'Saint Kitts and Nevis', dialCode: '+1869', flag: '🇰🇳' },
  { code: 'LC', name_fr: 'Sainte-Lucie', name_en: 'Saint Lucia', dialCode: '+1758', flag: '🇱🇨' },
  { code: 'VC', name_fr: 'Saint-Vincent-et-les-Grenadines', name_en: 'Saint Vincent and the Grenadines', dialCode: '+1784', flag: '🇻🇨' },
  { code: 'SB', name_fr: 'Salomon', name_en: 'Solomon Islands', dialCode: '+677', flag: '🇸🇧' },
  { code: 'WS', name_fr: 'Samoa', name_en: 'Samoa', dialCode: '+685', flag: '🇼🇸' },
  { code: 'SM', name_fr: 'Saint-Marin', name_en: 'San Marino', dialCode: '+378', flag: '🇸🇲' },
  { code: 'ST', name_fr: 'Sao Tomé-et-Principe', name_en: 'São Tomé and Príncipe', dialCode: '+239', flag: '🇸🇹' },
  { code: 'SN', name_fr: 'Sénégal', name_en: 'Senegal', dialCode: '+221', flag: '🇸🇳' },
  { code: 'RS', name_fr: 'Serbie', name_en: 'Serbia', dialCode: '+381', flag: '🇷🇸' },
  { code: 'SC', name_fr: 'Seychelles', name_en: 'Seychelles', dialCode: '+248', flag: '🇸🇨' },
  { code: 'SL', name_fr: 'Sierra Leone', name_en: 'Sierra Leone', dialCode: '+232', flag: '🇸🇱' },
  { code: 'SG', name_fr: 'Singapour', name_en: 'Singapore', dialCode: '+65', flag: '🇸🇬' },
  { code: 'SK', name_fr: 'Slovaquie', name_en: 'Slovakia', dialCode: '+421', flag: '🇸🇰' },
  { code: 'SI', name_fr: 'Slovénie', name_en: 'Slovenia', dialCode: '+386', flag: '🇸🇮' },
  { code: 'SO', name_fr: 'Somalie', name_en: 'Somalia', dialCode: '+252', flag: '🇸🇴' },
  { code: 'SD', name_fr: 'Soudan', name_en: 'Sudan', dialCode: '+249', flag: '🇸🇩' },
  { code: 'SS', name_fr: 'Soudan du Sud', name_en: 'South Sudan', dialCode: '+211', flag: '🇸🇸' },
  { code: 'LK', name_fr: 'Sri Lanka', name_en: 'Sri Lanka', dialCode: '+94', flag: '🇱🇰' },
  { code: 'SE', name_fr: 'Suède', name_en: 'Sweden', dialCode: '+46', flag: '🇸🇪' },
  { code: 'CH', name_fr: 'Suisse', name_en: 'Switzerland', dialCode: '+41', flag: '🇨🇭' },
  { code: 'SR', name_fr: 'Suriname', name_en: 'Suriname', dialCode: '+597', flag: '🇸🇷' },
  { code: 'SY', name_fr: 'Syrie', name_en: 'Syria', dialCode: '+963', flag: '🇸🇾' },
  { code: 'TJ', name_fr: 'Tadjikistan', name_en: 'Tajikistan', dialCode: '+992', flag: '🇹🇯' },
  { code: 'TZ', name_fr: 'Tanzanie', name_en: 'Tanzania', dialCode: '+255', flag: '🇹🇿' },
  { code: 'TD', name_fr: 'Tchad', name_en: 'Chad', dialCode: '+235', flag: '🇹🇩' },
  { code: 'CZ', name_fr: 'Tchéquie', name_en: 'Czech Republic', dialCode: '+420', flag: '🇨🇿' },
  { code: 'TH', name_fr: 'Thaïlande', name_en: 'Thailand', dialCode: '+66', flag: '🇹🇭' },
  { code: 'TL', name_fr: 'Timor oriental', name_en: 'Timor-Leste', dialCode: '+670', flag: '🇹🇱' },
  { code: 'TG', name_fr: 'Togo', name_en: 'Togo', dialCode: '+228', flag: '🇹🇬' },
  { code: 'TO', name_fr: 'Tonga', name_en: 'Tonga', dialCode: '+676', flag: '🇹🇴' },
  { code: 'TT', name_fr: 'Trinité-et-Tobago', name_en: 'Trinidad and Tobago', dialCode: '+1868', flag: '🇹🇹' },
  { code: 'TN', name_fr: 'Tunisie', name_en: 'Tunisia', dialCode: '+216', flag: '🇹🇳' },
  { code: 'TM', name_fr: 'Turkménistan', name_en: 'Turkmenistan', dialCode: '+993', flag: '🇹🇲' },
  { code: 'TR', name_fr: 'Türkiye', name_en: 'Turkey', dialCode: '+90', flag: '🇹🇷' },
  { code: 'TV', name_fr: 'Tuvalu', name_en: 'Tuvalu', dialCode: '+688', flag: '🇹🇻' },
  { code: 'UA', name_fr: 'Ukraine', name_en: 'Ukraine', dialCode: '+380', flag: '🇺🇦' },
  { code: 'UY', name_fr: 'Uruguay', name_en: 'Uruguay', dialCode: '+598', flag: '🇺🇾' },
  { code: 'US', name_fr: 'États-Unis', name_en: 'United States', dialCode: '+1', flag: '🇺🇸' },
  { code: 'VU', name_fr: 'Vanuatu', name_en: 'Vanuatu', dialCode: '+678', flag: '🇻🇺' },
  { code: 'VE', name_fr: 'Venezuela', name_en: 'Venezuela', dialCode: '+58', flag: '🇻🇪' },
  { code: 'VN', name_fr: 'Viêt Nam', name_en: 'Vietnam', dialCode: '+84', flag: '🇻🇳' },
  { code: 'YE', name_fr: 'Yémen', name_en: 'Yemen', dialCode: '+967', flag: '🇾🇪' },
  { code: 'ZM', name_fr: 'Zambie', name_en: 'Zambia', dialCode: '+260', flag: '🇿🇲' },
  { code: 'ZW', name_fr: 'Zimbabwe', name_en: 'Zimbabwe', dialCode: '+263', flag: '🇿🇼' },
];

// Utilitaires
export function getCountryByCode(code: string): Country | undefined {
  return COUNTRIES.find(c => c.code === code);
}

export function getCountryName(code: string, lang: 'fr' | 'en' = 'fr'): string {
  const country = getCountryByCode(code);
  if (!country) return code;
  return lang === 'en' ? country.name_en : country.name_fr;
}

// Pays triés par nom pour une langue donnée
export function getSortedCountries(lang: 'fr' | 'en' = 'fr'): Country[] {
  return [...COUNTRIES].sort((a, b) => {
    const nameA = lang === 'en' ? a.name_en : a.name_fr;
    const nameB = lang === 'en' ? b.name_en : b.name_fr;
    return nameA.localeCompare(nameB, lang);
  });
}

// Devise par défaut selon le pays
export function getCurrencyForCountry(code: string): string {
  // Zone Euro
  if (['FR', 'BE', 'DE', 'IT', 'ES', 'PT', 'NL', 'AT', 'IE', 'FI', 'GR', 'LU', 'MT', 'CY', 'EE', 'LV', 'LT', 'SK', 'SI', 'MC', 'AD', 'SM', 'VA'].includes(code)) return '€';
  
  // Dollar US
  if (['US', 'EC', 'SV', 'PR', 'ZW'].includes(code)) return '$';
  
  // Dollar Canadien
  if (code === 'CA') return 'CAD';
  
  // Franc Suisse
  if (code === 'CH') return 'CHF';
  
  // Dirham Marocain
  if (code === 'MA') return 'MAD';
  
  // Dinar Algérien
  if (code === 'DZ') return 'DZD';
  
  // Dinar Tunisien
  if (code === 'TN') return 'TND';

  // Ouguiya Mauritanien
  if (code === 'MR') return 'MRU';

  // Franc Guinéen
  if (code === 'GN') return 'GNF';

  // Franc Congolais
  if (code === 'CD') return 'CDF';
  
  // Franc Rwandais
  if (code === 'RW') return 'RWF';

  // Franc Burundais
  if (code === 'BI') return 'BIF';

  // Franc Djiboutien
  if (code === 'DJ') return 'DJF';
  
  // Franc Comorien
  if (code === 'KM') return 'KMF';

  // Ariary Malgache
  if (code === 'MG') return 'MGA';

  // Cedi Ghanéen
  if (code === 'GH') return 'GHS';
  
  // Naira Nigérian
  if (code === 'NG') return 'NGN';
  
  // Livre Sterling
  if (code === 'GB') return '£';

  // Par défaut, FCFA (UEMOA / CEMAC) pour les pays francophones d'Afrique non spécifiés ci-dessus
  // BJ, BF, CI, GW, ML, NE, SN, TG (UEMOA)
  // CM, CF, CG, GA, GQ, TD (CEMAC)
  if (['BJ', 'BF', 'CI', 'GW', 'ML', 'NE', 'SN', 'TG', 'CM', 'CF', 'CG', 'GA', 'GQ', 'TD'].includes(code)) return 'FCFA';

  // Fallback si non trouvé
  return 'FCFA';
}
