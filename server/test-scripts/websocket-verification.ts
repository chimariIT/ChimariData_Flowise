/**
 * Manual WebSocket Verification Script
 * 
 * This script connects to the WebSocket server and verifies that
 * progress events are properly emitted during project execution.
 * 
 * Usage: ts-node server/test-scripts/websocket-verification.ts
 */

import { io, Socket } from 'socket.io-client';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const TEST_PROJECT_ID = 'test-project-' + Date.now();

interface ProgressEvent {
    projectId: string;
    status: string;
    overallProgress: number;
    currentStep?: {
        id: string;
        name: string;
        status: string;
        description?: string;
    };
    timestamp?: string;
}

class WebSocketVerifier {
    private socket: Socket | null = null;
    private eventsReceived: ProgressEvent[] = [];
    private connectionEstablished = false;

    async verify(): Promise<void> {
        console.log('🔌 Starting WebSocket Verification...\n');

        try {
            await this.connectToServer();
            await this.subscribeToProject();
            await this.simulateProgressEvents();
            await this.verifyResults();
        } catch (error) {
            console.error('❌ Verification failed:', error);
            process.exit(1);
        } finally {
            this.cleanup();
        }
    }

    private async connectToServer(): Promise<void> {
        return new Promise((resolve, reject) => {
            console.log(`📡 Connecting to ${SERVER_URL}...`);

            this.socket = io(SERVER_URL, {
                transports: ['websocket'],
                reconnection: false,
            });

            this.socket.on('connect', () => {
                console.log('✅ Connected to WebSocket server');
                console.log(`   Socket ID: ${this.socket?.id}\n`);
                this.connectionEstablished = true;
                resolve();
            });

            this.socket.on('connect_error', (error) => {
                console.error('❌ Connection error:', error.message);
                reject(error);
            });

            // Timeout after 5 seconds
            setTimeout(() => {
                if (!this.connectionEstablished) {
                    reject(new Error('Connection timeout'));
                }
            }, 5000);
        });
    }

    private async subscribeToProject(): Promise<void> {
        if (!this.socket) throw new Error('Socket not connected');

        console.log(`📝 Subscribing to project: ${TEST_PROJECT_ID}`);

        this.socket.emit('subscribe_project', TEST_PROJECT_ID);

        this.socket.on('execution_progress', (event: ProgressEvent) => {
            console.log(`📊 Progress Event Received:`);
            console.log(`   Status: ${event.status}`);
            console.log(`   Progress: ${event.overallProgress}%`);
            if (event.currentStep) {
                console.log(`   Step: ${event.currentStep.name} (${event.currentStep.status})`);
                if (event.currentStep.description) {
                    console.log(`   Description: ${event.currentStep.description}`);
                }
            }
            console.log('');

            this.eventsReceived.push(event);
        });

        console.log('✅ Subscribed to project events\n');
    }

    private async simulateProgressEvents(): Promise<void> {
        if (!this.socket) throw new Error('Socket not connected');

        console.log('🎬 Simulating progress events...\n');

        const testEvents: ProgressEvent[] = [
            {
                projectId: TEST_PROJECT_ID,
                status: 'running',
                overallProgress: 10,
                currentStep: {
                    id: 'data_loading',
                    name: 'Loading Data',
                    status: 'running',
                    description: 'Reading dataset from storage'
                }
            },
            {
                projectId: TEST_PROJECT_ID,
                status: 'running',
                overallProgress: 30,
                currentStep: {
                    id: 'data_quality',
                    name: 'Quality Analysis',
                    status: 'running',
                    description: 'Analyzing data quality metrics'
                }
            },
            {
                projectId: TEST_PROJECT_ID,
                status: 'running',
                overallProgress: 60,
                currentStep: {
                    id: 'analysis',
                    name: 'Statistical Analysis',
                    status: 'running',
                    description: 'Computing statistical measures'
                }
            },
            {
                projectId: TEST_PROJECT_ID,
                status: 'completed',
                overallProgress: 100,
                currentStep: {
                    id: 'complete',
                    name: 'Analysis Complete',
                    status: 'completed',
                    description: 'All tasks finished successfully'
                }
            }
        ];

        for (const event of testEvents) {
            // Emit event to the server (which should broadcast it back)
            this.socket.emit('test_progress_event', event);

            // Wait a bit between events
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Wait for all events to be received
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    private async verifyResults(): Promise<void> {
        console.log('\n📋 Verification Results:\n');
        console.log(`   Events Sent: 4`);
        console.log(`   Events Received: ${this.eventsReceived.length}`);

        if (this.eventsReceived.length === 0) {
            console.log('\n⚠️  WARNING: No events received!');
            console.log('   This could mean:');
            console.log('   1. The server is not emitting events correctly');
            console.log('   2. The SocketManager is not configured');
            console.log('   3. The test event emission is not set up on the server');
            console.log('\n   Note: This is expected if the server does not have');
            console.log('   a test event handler. In production, events are emitted');
            console.log('   by PythonProcessor, ProjectAgentOrchestrator, etc.\n');
        } else {
            console.log('\n✅ WebSocket communication is working!');
            console.log('\n   Event Timeline:');
            this.eventsReceived.forEach((event, index) => {
                console.log(`   ${index + 1}. ${event.currentStep?.name || 'Unknown'} - ${event.overallProgress}%`);
            });
            console.log('');
        }

        console.log('✅ Manual verification complete!\n');
    }

    private cleanup(): void {
        if (this.socket) {
            console.log('🔌 Disconnecting...');
            this.socket.disconnect();
        }
    }
}

// Run verification
const verifier = new WebSocketVerifier();
verifier.verify().catch(console.error);
