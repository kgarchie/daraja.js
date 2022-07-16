import { RSA_PKCS1_PADDING } from "constants";
import { publicEncrypt } from "crypto";
import { promises } from "fs";
import { CustomerToBusiness } from "./api/c2b";
import { STKPush } from "./api/stkPush";
import { routes } from "./models/routes";
import { getProductionCert, getSandboxCert, HttpClient } from "./utils";

interface MpesaCredentials {
  consumerKey: string;
  consumerSecret: string;
  securityCredential: string;
  initiatorPassword: string;
  certificatePath: string;
  organizationShortCode: number;
}

export class Mpesa {
  _http: HttpClient;
  private _lastTokenTime: number;
  private _currentToken: string;
  private consumerKey: string;
  private consumerSecret: string;
  private initiatorPassword: string;
  private securityCredential: string;
  private globalShortCode: number;

  constructor(
    {
      consumerKey,
      consumerSecret,
      securityCredential,
      initiatorPassword,
      certificatePath,
      organizationShortCode,
    }: MpesaCredentials,
    private environment: string
  ) {
    this.consumerKey = consumerKey;
    this.consumerSecret = consumerSecret;
    this.globalShortCode = organizationShortCode;
    this._http = new HttpClient(this.environment);

    if (!this.environment) {
      this.environment = "sandbox";
    }

    if (!securityCredential && !initiatorPassword) {
      throw new Error(
        "You must provide either the security credential or initiator password. Both cannot be null"
      );
    }

    if (!securityCredential) {
      this.generateSecurityCredential(initiatorPassword, certificatePath);
    } else {
      this.securityCredential = securityCredential;
    }
  }

  async _getAuthToken(): Promise<string> {
    if (Date.now() - this._lastTokenTime < 3599) {
      // cache hit, sort of :)
      return this._currentToken;
    } else {
      // token expired
      try {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const { data } = await this._http.get<any>(routes.oauth, {
          Authorization:
            "Basic " +
            Buffer.from(this.consumerKey + ":" + this.consumerSecret).toString(
              "base64"
            ),
        });

        this._currentToken = data.access_token;
        this._lastTokenTime = Date.now();

        return data.access_token;
      } catch (error) {
        throw new Error(error);
      }
    }
  }

  private async generateSecurityCredential(
    password: string,
    certificatePath: string
  ) {
    let certificate: string;

    if (certificatePath != null) {
      const certificateBuffer = await promises.readFile(certificatePath);

      certificate = String(certificateBuffer);
    } else {
      certificate =
        this.environment === "production"
          ? getProductionCert()
          : getSandboxCert();
    }

    this.securityCredential = publicEncrypt(
      {
        key: certificate,
        padding: RSA_PKCS1_PADDING,
      },
      Buffer.from(password)
    ).toString("base64");
  }

  public c2b(): CustomerToBusiness {
    return new CustomerToBusiness(this);
  }

  public lipaNaMpesa(): STKPush {
    return new STKPush(this);
  }
}