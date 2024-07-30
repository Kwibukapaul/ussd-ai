const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const config = require('./config');
const translations = require('./translations');
const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs');
const util = require('util');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Google Text-to-Speech client setup
const ttsClient = new textToSpeech.TextToSpeechClient({
    keyFilename: config.googleTTSKeyFile
});

app.post('/ussd', async (req, res) => {
    const { sessionId, serviceCode, phoneNumber, text } = req.body;
    console.log(`Received request: ${JSON.stringify(req.body)}`);

    let response = '';
    const textArray = text.split('*');
    const userInput = textArray[textArray.length - 1];

    let language = 'en';  // default language

    if (text === '') {
        response = `CON ${translations[language].welcome}`;
    } else if (textArray[0] === '1' || textArray[0] === '2' || textArray[0] === '3') {
        // Language selection
        switch (textArray[0]) {
            case '1': language = 'en'; break;
            case '2': language = 'rw'; break;
            case '3': language = 'fr'; break;
        }

        if (textArray.length === 1) {
            response = `CON ${translations[language].enterCountry}`;
        } else if (textArray.length === 2) {
            response = `CON ${translations[language].enterCity}`;
        } else if (textArray.length === 3) {
            response = `CON ${translations[language].enterDistrict}`;
        } else if (textArray.length === 4) {
            const country = textArray[1];
            const city = textArray[2];
            const district = userInput;
            const location = `${city}, ${district}, ${country}`;
            try {
                const weather = await getWeather(location);
                const weatherText = translations[language].weather(location, weather.description, weather.temp);
                response = `END ${weatherText}`;

                // Convert text to speech
                const audioFile = await convertTextToSpeech(weatherText, `output-${sessionId}.mp3`);
                // Send SMS with link to audio file
                sendSMS(phoneNumber, `Listen to the weather update: ${audioFile}`);
            } catch (error) {
                response = `END ${translations[language].error} ${location}`;
            }
        }
    } else {
        response = `END ${translations[language].invalidOption}`;
    }

    res.set('Content-Type', 'text/plain');
    res.send(response);
});

const getWeather = async (location) => {
    const url = `http://api.openweathermap.org/data/2.5/weather?q=${location}&appid=${config.weatherApiKey}&units=metric`;
    const response = await axios.get(url);
    const { weather, main } = response.data;
    return {
        description: weather[0].description,
        temp: main.temp
    };
};

const convertTextToSpeech = async (text, outputFile) => {
    const request = {
        input: { text: text },
        voice: { languageCode: 'en-US', ssmlGender: 'NEUTRAL' },
        audioConfig: { audioEncoding: 'MP3' },
    };

    const [response] = await ttsClient.synthesizeSpeech(request);
    const writeFile = util.promisify(fs.writeFile);
    await writeFile(outputFile, response.audioContent, 'binary');
    console.log(`Audio content written to file: ${outputFile}`);
    return `https://your-domain.com/audio/${outputFile}`; // URL where the audio file is hosted
};

const sendSMS = (phoneNumber, message) => {
    // Implement your SMS sending logic here (e.g., using Twilio or another SMS service)
    console.log(`Sending SMS to ${phoneNumber}: ${message}`);
};

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
