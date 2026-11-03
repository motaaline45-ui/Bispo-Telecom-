import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_DRIVE_CLIENT_ID, isValidGoogleClientId, resolveDriveClientConfiguration,
} from '../js/drive.js';

test('ships with a valid, editable public Google OAuth client ID', () => {
  assert.equal(
    DEFAULT_DRIVE_CLIENT_ID,
    '497224513940-33vjsag19sf7g4pauk6881gkg0ujhtug.apps.googleusercontent.com',
  );
  assert.equal(isValidGoogleClientId(DEFAULT_DRIVE_CLIENT_ID), true);
});

test('validates Google OAuth client ID format', () => {
  assert.equal(isValidGoogleClientId('  123456-example.apps.googleusercontent.com  '), true);
  assert.equal(isValidGoogleClientId('not-a-client-id'), false);
  assert.equal(isValidGoogleClientId('123456-example.googleusercontent.com'), false);
});

test('requires confirmation when only the code fallback is available', () => {
  assert.deepEqual(resolveDriveClientConfiguration({}), {
    clientId: DEFAULT_DRIVE_CLIENT_ID,
    clientIdConfigured: false,
  });
});

test('recognizes valid IDs saved by older app versions', () => {
  const clientId = '123456-example.apps.googleusercontent.com';
  assert.deepEqual(resolveDriveClientConfiguration({ clientId }), {
    clientId,
    clientIdConfigured: true,
  });
});

test('keeps invalid saved IDs visible but asks for configuration again', () => {
  const clientId = 'invalid-client';
  assert.deepEqual(resolveDriveClientConfiguration({ clientId }), {
    clientId,
    clientIdConfigured: false,
  });
});

test('does not treat an unconfirmed fallback as configured', () => {
  assert.deepEqual(resolveDriveClientConfiguration({
    clientId: DEFAULT_DRIVE_CLIENT_ID,
    clientIdConfigured: false,
  }), {
    clientId: DEFAULT_DRIVE_CLIENT_ID,
    clientIdConfigured: false,
  });
});
