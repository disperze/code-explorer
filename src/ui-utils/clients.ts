import { makeCosmoshubPath, OfflineAminoSigner } from "@cosmjs/amino";
import {
  CosmWasmClient as StargateClient,
  SigningCosmWasmClient as StargateSigningClient,
} from "@cosmjs/cosmwasm-stargate";
import { Bip39, Random } from "@cosmjs/crypto";
import { LedgerSigner } from "@cosmjs/ledger-amino";
import { DirectSecp256k1HdWallet, OfflineDirectSigner, OfflineSigner, Registry } from "@cosmjs/proto-signing";
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import { MsgExecuteContract, MsgInstantiateContract, MsgStoreCode } from "cosmjs-types/cosmwasm/wasm/v1/tx";

import { settings } from "../settings";
import { msgExecuteContractTypeUrl, msgInstantiateContractTypeUrl, msgStoreCodeTypeUrl } from "./txs";

export { StargateClient, StargateSigningClient };

export function generateMnemonic(): string {
  return Bip39.encode(Random.getBytes(16)).toString();
}

export function loadOrCreateMnemonic(mnemonic?: string): string {
  const key = "burner-wallet";
  const loaded = localStorage.getItem(key);
  if (loaded && !mnemonic) {
    return loaded;
  }
  const loadedMnemonic = mnemonic || generateMnemonic();
  localStorage.setItem(key, loadedMnemonic);
  return loadedMnemonic;
}

export type WalletLoaderDirect = (
  addressPrefix: string,
  mnemonic?: string,
) => Promise<OfflineDirectSigner | OfflineAminoSigner>;

export function loadKeplrWallet(client: StargateClient, keplrChainInfo: any): WalletLoaderDirect {
  return async () => {
    const chaindId = await client.getChainId();

    await registerKeplrChain(keplrChainInfo);
    const w = window as any;
    await w.keplr.enable(chaindId);

    return w.getOfflineSigner(chaindId);
  };
}

async function registerKeplrChain(keplrChainInfo: any): Promise<void> {
  const w = window as any;
  if (!w.getOfflineSigner || !w.keplr) {
    throw new Error("Please install keplr extension");
  }

  if (!w.keplr.experimentalSuggestChain) {
    throw new Error("Please use the recent version of keplr extension");
  }

  try {
    await w.keplr.experimentalSuggestChain(keplrChainInfo);
  } catch {
    throw new Error("Failed to suggest the chain");
  }
}

export async function loadOrCreateWalletDirect(
  addressPrefix: string,
  mnemonic?: string,
): Promise<OfflineDirectSigner> {
  const loadedMnemonic = loadOrCreateMnemonic(mnemonic);
  const hdPath = makeCosmoshubPath(0);
  return DirectSecp256k1HdWallet.fromMnemonic(loadedMnemonic, {
    hdPaths: [hdPath],
    prefix: addressPrefix,
  });
}

export async function loadLedgerWallet(addressPrefix: string): Promise<OfflineAminoSigner> {
  const interactiveTimeout = 120_000;
  const ledgerTransport = await TransportWebUSB.create(interactiveTimeout, interactiveTimeout);

  return new LedgerSigner(ledgerTransport, { hdPaths: [makeCosmoshubPath(0)], prefix: addressPrefix });
}

async function createStargateSigningClient(signer: OfflineSigner): Promise<StargateSigningClient> {
  const { nodeUrls } = settings.backend;
  const endpoint = nodeUrls[0];

  const typeRegistry = new Registry([
    [msgStoreCodeTypeUrl, MsgStoreCode],
    [msgInstantiateContractTypeUrl, MsgInstantiateContract],
    [msgExecuteContractTypeUrl, MsgExecuteContract],
  ]);

  return StargateSigningClient.connectWithSigner(endpoint, signer, {
    registry: typeRegistry,
  });
}

export async function getAddressAndStargateSigningClient(
  loadWallet: WalletLoaderDirect,
  mnemonic?: string,
): Promise<[string, StargateSigningClient]> {
  const signer = await loadWallet(settings.backend.addressPrefix, mnemonic);
  const userAddress = (await signer.getAccounts())[0].address;
  const signingClient = await createStargateSigningClient(signer);
  return [userAddress, signingClient];
}

export function webUsbMissing(): boolean {
  const anyNavigator: any = navigator;
  return !anyNavigator?.usb;
}