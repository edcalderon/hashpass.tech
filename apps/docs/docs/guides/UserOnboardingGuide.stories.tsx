import { Meta, StoryObj } from '@storybook/react';
import React from 'react';

const meta: Meta = {
  title: 'Guides/User Onboarding',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Complete step-by-step guide for new users to get started with HashPass.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Step 1: Sign In
export const Step1SignIn: Story = {
  render: () => (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '20px' }}>Step 1: Sign In to Your Account</h1>
      <p style={{ fontSize: '18px', lineHeight: '1.6', marginBottom: '30px', color: '#6d6d70' }}>
        To get started, you'll need to sign in to the HashPass app. Here's how:
      </p>
      <ol style={{ fontSize: '16px', lineHeight: '1.8', paddingLeft: '20px' }}>
        <li style={{ marginBottom: '12px' }}>Open the HashPass app on your device</li>
        <li style={{ marginBottom: '12px' }}>Enter your email address</li>
        <li style={{ marginBottom: '12px' }}>Check your email for a one-time login code</li>
        <li style={{ marginBottom: '12px' }}>Enter the code to access your account</li>
      </ol>
      <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#f2f2f7', borderRadius: '10px' }}>
        <strong>💡 Tip:</strong> Make sure to check your spam folder if you don't receive the code within a few minutes.
      </div>
    </div>
  ),
};

// Step 2: Explore Speakers
export const Step2ExploreSpeakers: Story = {
  render: () => (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '20px' }}>Step 2: Explore Speakers & Events</h1>
      <p style={{ fontSize: '18px', lineHeight: '1.6', marginBottom: '30px', color: '#6d6d70' }}>
        Once you're signed in, you can browse through the amazing speakers and events:
      </p>
      <ul style={{ fontSize: '16px', lineHeight: '1.8', paddingLeft: '20px' }}>
        <li style={{ marginBottom: '12px' }}>Navigate to the Explore section</li>
        <li style={{ marginBottom: '12px' }}>Browse speakers by category or search for specific names</li>
        <li style={{ marginBottom: '12px' }}>View speaker profiles, topics, and availability</li>
      </ul>
    </div>
  ),
};

// Step 3: Send Meeting Request
export const Step3SendMeetingRequest: Story = {
  render: () => (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '20px' }}>Step 3: Send a Meeting Request</h1>
      <p style={{ fontSize: '18px', lineHeight: '1.6', marginBottom: '30px', color: '#6d6d70' }}>
        Ready to connect with a speaker? Here's how to send a meeting request:
      </p>
      <ol style={{ fontSize: '16px', lineHeight: '1.8', paddingLeft: '20px' }}>
        <li style={{ marginBottom: '12px' }}>Find a speaker you'd like to meet</li>
        <li style={{ marginBottom: '12px' }}>Tap on their profile to view details</li>
        <li style={{ marginBottom: '12px' }}>Click the "Request Meeting" button</li>
        <li style={{ marginBottom: '12px' }}>Select your preferred date and time slot</li>
        <li style={{ marginBottom: '12px' }}>Add a message (optional) explaining why you'd like to meet</li>
        <li style={{ marginBottom: '12px' }}>Submit your request and wait for confirmation</li>
      </ol>
    </div>
  ),
};

// Step 4: Track Requests
export const Step4TrackRequests: Story = {
  render: () => (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '20px' }}>Step 4: Track Your Requests</h1>
      <p style={{ fontSize: '18px', lineHeight: '1.6', marginBottom: '30px', color: '#6d6d70' }}>
        Keep track of all your meeting requests:
      </p>
      <ul style={{ fontSize: '16px', lineHeight: '1.8', paddingLeft: '20px' }}>
        <li style={{ marginBottom: '12px' }}>Check the Notifications section for updates</li>
        <li style={{ marginBottom: '12px' }}>View pending, accepted, or declined requests</li>
        <li style={{ marginBottom: '12px' }}>Receive notifications when speakers respond</li>
      </ul>
    </div>
  ),
};

// Troubleshooting
export const Troubleshooting: Story = {
  render: () => (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '20px', color: '#FF9500' }}>🔧 Having Issues Loading the Web App?</h1>
      <p style={{ fontSize: '18px', lineHeight: '1.6', marginBottom: '30px', color: '#6d6d70' }}>
        If you're experiencing problems loading the web app, we recommend clearing your browser cache or performing a hard refresh:
      </p>
      <ul style={{ fontSize: '16px', lineHeight: '1.8', paddingLeft: '20px' }}>
        <li style={{ marginBottom: '12px' }}>
          <strong>Clear browser cache:</strong> Go to your browser settings and clear cached images and files
        </li>
        <li style={{ marginBottom: '12px' }}>
          <strong>Hard refresh:</strong> Press <code style={{ backgroundColor: '#f2f2f7', padding: '2px 6px', borderRadius: '4px' }}>Ctrl+Shift+R</code> (Windows/Linux) or <code style={{ backgroundColor: '#f2f2f7', padding: '2px 6px', borderRadius: '4px' }}>Cmd+Shift+R</code> (Mac) to reload the page without cache
        </li>
      </ul>
    </div>
  ),
};

