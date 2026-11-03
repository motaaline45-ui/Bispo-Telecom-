import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GOOGLE_OAUTH_CLIENT_ID, isValidGoogleClientId } from '../js/drive.js';

test('ships with the public Google OAuth client ID embedded in code', () => {
  assert.equal(
    GOOGLE_OAUTH_CLIENT_ID,
    '497224513940-33vjsag19sf7g4pauk6881gkg0ujhtug.apps.googleusercontent.com',
  );
  assert.equal(isValidGoogleClientId(GOOGLE_OAUTH_CLIENT_ID), true);
});

test('validates Google OAuth client ID format', () => {
  assert.equal(isValidGoogleClientId('  123456-example.apps.googleusercontent.com  '), true);
  assert.equal(isValidGoogleClientId('not-a-client-id'), false);
  assert.equal(isValidGoogleClientId('123456-example.googleusercontent.com'), false);
});
