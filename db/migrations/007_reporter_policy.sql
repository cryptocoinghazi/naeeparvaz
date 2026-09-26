CREATE TABLE reporter_policy_versions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document JSONB NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by TEXT NOT NULL
);
CREATE FUNCTION prevent_reporter_policy_version_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Published reporter policies are immutable';
END;
$$;
CREATE TRIGGER reporter_policy_version_immutable BEFORE UPDATE OR DELETE ON reporter_policy_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_reporter_policy_version_change();

CREATE TABLE reporter_policy_settings (
  id INTEGER PRIMARY KEY CHECK (id=1),
  body_en TEXT NOT NULL,
  body_hi TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  published_revision INTEGER,
  current_version_id INTEGER REFERENCES reporter_policy_versions(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO reporter_policy_settings(id,body_en,body_hi) VALUES (1,
$en$1. Truthful application: I confirm that my application details and submitted documents are genuine and accurate to the best of my knowledge. I will inform the editor of material changes.

2. Proper use of the ID card: I will use the Naee Parvaz reporter card only for lawful, authorized journalistic work. I will not lend, transfer, alter, duplicate for another person, or misuse the card. It is an organisational identity card, not government accreditation or permission to exercise police or other official powers.

3. No unlawful personal advantage: I will not use the card, organisation’s name or reporting position for threats, intimidation, extortion, bribery, unauthorized collections, unlawful access or personal favours. I will not accept money or benefits in exchange for publishing or suppressing news.

4. Accuracy and verification: I will take reasonable steps to verify facts and sources, distinguish allegations and opinions from established facts, and disclose uncertainty to the editor. I will not knowingly submit fabricated reports, false allegations, misleadingly edited material or invented evidence.

5. Editorial authorization: I will follow editorial instructions and will not present personal statements, commitments or independently published material as official Naee Parvaz reporting without authorization. I will disclose relevant conflicts of interest and cooperate with fact-checking and corrections.

6. Respectful and lawful reporting: I will respect privacy, dignity, copyright and applicable reporting restrictions; protect confidential sources appropriately; and exercise particular care when reporting about children, victims and vulnerable people. I will not engage in harassment or discriminatory incitement.

7. Responsibility and cooperation: I accept responsibility for my own unlawful, unauthorized or knowingly false conduct, subject to applicable law. Possessing a reporter card does not mean Naee Parvaz authorizes such conduct. I will promptly report errors, complaints, card loss or suspected misuse and cooperate with appropriate review.

8. Withdrawal of authorization: Breaches may lead to rejection of the application or withdrawal of reporting authorization and revocation of the card following editorial review. I must stop using the card and representing the organisation when it expires or is revoked. Payment does not excuse misconduct, and the separately stated refund policy remains unchanged.

This declaration does not exclude any responsibility or duty that applicable law places on Naee Parvaz, its editors or the reporter.$en$,
$hi$1. सत्य आवेदन: मैं पुष्टि करता/करती हूँ कि मेरी जानकारी के अनुसार मेरे आवेदन के विवरण और प्रस्तुत दस्तावेज़ वास्तविक और सही हैं। किसी महत्वपूर्ण परिवर्तन की सूचना मैं संपादक को दूँगा/दूँगी।

2. पहचान-पत्र का उचित उपयोग: मैं नई परवाज़ रिपोर्टर कार्ड का उपयोग केवल वैध और अधिकृत पत्रकारिता कार्य के लिए करूँगा/करूँगी। मैं कार्ड किसी को उधार नहीं दूँगा/दूँगी, हस्तांतरित नहीं करूँगा/करूँगी, उसमें बदलाव नहीं करूँगा/करूँगी, किसी अन्य व्यक्ति के लिए उसकी प्रतिलिपि नहीं बनाऊँगा/बनाऊँगी और उसका दुरुपयोग नहीं करूँगा/करूँगी। यह संगठन का पहचान-पत्र है, सरकारी मान्यता या पुलिस अथवा अन्य सरकारी अधिकारों का प्रयोग करने की अनुमति नहीं।

3. अवैध निजी लाभ का निषेध: मैं कार्ड, संगठन के नाम या रिपोर्टर की भूमिका का उपयोग धमकी, डराने-धमकाने, जबरन वसूली, रिश्वत, अनधिकृत धन-संग्रह, अवैध प्रवेश या निजी लाभ के लिए नहीं करूँगा/करूँगी। समाचार प्रकाशित करने या दबाने के बदले धन या लाभ स्वीकार नहीं करूँगा/करूँगी।

4. सटीकता और सत्यापन: मैं तथ्यों और स्रोतों की जाँच के लिए उचित कदम उठाऊँगा/उठाऊँगी, आरोपों और विचारों को प्रमाणित तथ्यों से अलग रखूँगा/रखूँगी और अनिश्चितता की जानकारी संपादक को दूँगा/दूँगी। मैं जानबूझकर मनगढ़ंत रिपोर्ट, झूठे आरोप, भ्रामक रूप से संपादित सामग्री या गढ़े हुए प्रमाण प्रस्तुत नहीं करूँगा/करूँगी।

5. संपादकीय अनुमति: मैं संपादकीय निर्देशों का पालन करूँगा/करूँगी और बिना अनुमति अपने निजी वक्तव्य, वादे या स्वतंत्र रूप से प्रकाशित सामग्री को नई परवाज़ की आधिकारिक रिपोर्टिंग के रूप में प्रस्तुत नहीं करूँगा/करूँगी। मैं संबंधित हितों के टकराव का खुलासा करूँगा/करूँगी और तथ्य-जाँच तथा सुधारों में सहयोग करूँगा/करूँगी।

6. सम्मानजनक और वैध रिपोर्टिंग: मैं निजता, गरिमा, कॉपीराइट और लागू रिपोर्टिंग प्रतिबंधों का सम्मान करूँगा/करूँगी; गोपनीय स्रोतों की उचित रक्षा करूँगा/करूँगी; और बच्चों, पीड़ितों तथा संवेदनशील स्थिति वाले लोगों पर रिपोर्टिंग करते समय विशेष सावधानी बरतूँगा/बरतूँगी। मैं उत्पीड़न या भेदभावपूर्ण उकसावे में शामिल नहीं होऊँगा/होऊँगी।

7. जिम्मेदारी और सहयोग: लागू कानून के अधीन, मैं अपने अवैध, अनधिकृत या जानबूझकर झूठे आचरण की जिम्मेदारी स्वीकार करता/करती हूँ। रिपोर्टर कार्ड होना यह नहीं दर्शाता कि नई परवाज़ ऐसे आचरण की अनुमति देता है। मैं त्रुटियों, शिकायतों, कार्ड खोने या संदिग्ध दुरुपयोग की तुरंत सूचना दूँगा/दूँगी और उचित समीक्षा में सहयोग करूँगा/करूँगी।

8. अनुमति वापस लेना: नीति के उल्लंघन पर संपादकीय समीक्षा के बाद आवेदन अस्वीकार किया जा सकता है, रिपोर्टिंग की अनुमति वापस ली जा सकती है और कार्ड निरस्त किया जा सकता है। कार्ड की वैधता समाप्त होने या उसके निरस्त होने पर मैं उसका उपयोग और संगठन का प्रतिनिधित्व बंद कर दूँगा/दूँगी। भुगतान करने से अनुचित आचरण की छूट नहीं मिलती और अलग से बताई गई धन-वापसी नीति अपरिवर्तित रहती है।

यह घोषणा नई परवाज़, उसके संपादकों या रिपोर्टर पर लागू कानून द्वारा निर्धारित किसी जिम्मेदारी या कर्तव्य को समाप्त नहीं करती।$hi$);

ALTER TABLE reporter_upload_sessions ADD COLUMN policy_version_id INTEGER REFERENCES reporter_policy_versions(id);
CREATE TABLE reporter_policy_acceptances (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES reporter_applications(id),
  session_id UUID NOT NULL UNIQUE REFERENCES reporter_upload_sessions(id),
  policy_version_id INTEGER NOT NULL REFERENCES reporter_policy_versions(id),
  applicant_name TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('en','hi')),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reporter_policy_acceptances_application ON reporter_policy_acceptances(application_id);
