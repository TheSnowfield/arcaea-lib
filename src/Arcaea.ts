import axios, { AxiosResponse, AxiosRequestConfig } from 'axios';
import { IArcAggregateResponse, IArcAddResponse, IArcRankResponse, IArcSelfRankResponse, IArcLoginResponse, IArcPurchaseFriendResponse, IArcRegisteredResponse, IArcRegisteredResult } from './Arcaea.interface';
import { TokenNotFoundException } from './Arcaea.Exception';
import { v4 as uuid } from 'uuid';

const baseUrl: string = 'https://arcapi.lowiro.com/coffee/';

const loginUrl: string = '/auth/login',
      addUrl: string = "/friend/me/add",
      delUrl: string = "/friend/me/delete",
      friendInfo: string = "/compose/aggregate?calls=%5B%7B%20%22endpoint%22%3A%20%22user%2Fme%22%2C%20%22id%22%3A%200%20%7D%2C%20%7B%20%22endpoint%22%3A%20%22purchase%2Fbundle%2Fpack%22%2C%20%22id%22%3A%201%20%7D%5D",
      friendRankUrl: string = "/score/song/friend",
      worldRankUrl: string = "/score/song",
      selfRankUrl : string= "/score/song/me",
      purchaseUrl: string = "/purchase/me/friend/fragment",
      registeredUrl: string = "/user/";

const header: Object = {
    "Accept-Encoding":"gzip, deflate",
    "Content-Type":"application/x-www-form-urlencoded; charset=utf-8",
    "Accept-Language":"zh-cn",
    "Accept":"*/*",
    "Connection":"keep-alive",
    "Proxy-Connection":"keep-alive",
    "Platform": "ios"
};

function btoa(src: string): string{
    return Buffer.from(src).toString('base64');
}

interface IArcArg{
    token?: string;
    deviceId?: string;
    appVersion?: string;
    userAgent?: string;
    apiVersion?: string;
}

export const enum ArcDifficulty{
    Past = 0,
    Present = 1,
    Future = 2,
    Beyond = 3
}
export class Arcaea{
    private token: string;
    private deviceId: string;
    private opt: AxiosRequestConfig;
    private apiVersion: string;
    private selfId: number = -1;

    constructor(Arg?: IArcArg){
        let arg: IArcArg = Arg || {};
        this.token = arg.token || '';
        this.deviceId = arg.deviceId || '';
        this.apiVersion = arg.apiVersion || '12';
        let headers = Object.assign({}, header,{
            Authorization: "Bearer "+ this.token,
            AppVersion: arg.appVersion || '3.0.2',
            'User-Agent': arg.userAgent || "Arc-mobile/3.0.2.1 CFNetwork/811.5.4 Darwin/16.7.0"
        });
        this.opt = {
            headers
        };
    }
    private checkToken(): void{
        if(this.token){
            return;
        }
        throw new TokenNotFoundException();
    }

    private createLoginAuth(name: string, pass: string): string{
        let authStr = btoa(unescape(encodeURIComponent(`${name}:${pass}`)));
        return `Basic ${authStr}`;
    }

    private aggregateCheck(res: IArcAggregateResponse){
        if(!res.value) return;

        if(this.selfId === -1){
            this.selfId = res.value[0].value.user_id;
            this.opt.headers['i'] = this.selfId;
        }
    }

    public static createUUID(): string{
        return uuid().toUpperCase();
    }

    public async registered(name: string, password: string, email: string): Promise<IArcRegisteredResult>{
        let regHeaders = Object.assign({}, this.opt.headers, {
                'content-type': 'application/x-www-form-urlencoded; charset=utf-8'
            }),
            regOpt: any = {
                headers: regHeaders
            },
            device_id = Arcaea.createUUID(),
            requestStr = `name=${encodeURIComponent(name)}&password=${encodeURIComponent(password)}&email=${encodeURIComponent(email)}&device_id=${device_id}&platform=ios`;
        
        delete regHeaders['Authorization'];

        let res = await axios.post(`${baseUrl}${this.apiVersion}${registeredUrl}`, requestStr, regOpt),
            data: IArcRegisteredResponse= res.data;

        if(data.value){

            this.token = data.value.access_token;
            this.opt.headers.Authorization = "Bearer "+ this.token;
            this.opt.headers['i'] = data.value.user_id;

            return {
                success: true,
                access_token: this.token,
                device_id,
                user_id: data.value.user_id
            };
        }
        return {
            success: false,
            access_token: '',
            device_id: '',
            user_id: -1
        };
    }

    public async login(name: string, pass: string): Promise<string>{
        let auth = this.createLoginAuth(name, pass),
            loginHeaders = Object.assign({}, this.opt.headers, {
                Authorization: auth,
                DeviceId: this.deviceId
            }),
            loginOpt: any = {
                headers: loginHeaders
            },
            res: AxiosResponse = await axios.post(`${baseUrl}${this.apiVersion}${loginUrl}`,'grant_type=client_credentials', loginOpt),
            data: IArcLoginResponse = res.data;
        if(data.success){
            this.token = data.token_type + ' ' + data.access_token;
            this.opt.headers.Authorization = this.token;
            return this.token;
        }
        return '';
    }

    public async get<R>(url: string, params?: any): Promise<R>{
        this.checkToken();

        let trueConfig: AxiosRequestConfig = this.opt;

        if(params){
            trueConfig = Object.assign({}, this.opt, {
                params
            });
        }

        let response: AxiosResponse = await axios.get(url, trueConfig),
            result: R = response.data;

        return result;
    }

    public async post<R>(url: string, data: string){
        this.checkToken();

        let response: AxiosResponse = await axios.post(url, data, this.opt),
            result: R = response.data;

        return result;
    }

    public async aggregate(): Promise<IArcAggregateResponse>{
        let data = await this.get<IArcAggregateResponse>(`${baseUrl}${this.apiVersion}${friendInfo}`);

        this.aggregateCheck(data);

        return data;
    }

    public async addFriend(friend_code: string): Promise<IArcAddResponse>{
        let data = await this.post<IArcAddResponse>(`${baseUrl}${this.apiVersion}${addUrl}`, `friend_code=${friend_code}`);
        return data;
    }

    public async delFriend(user_id: number): Promise<boolean>{
        type delResponse = {success: boolean,friends: any[]};

        let data: delResponse = await this.post<delResponse>(`${baseUrl}${this.apiVersion}${delUrl}`, `friend_id=${user_id}`);
        return data.success;
    }

    public async getFriendsRank(song_id: string, difficulty: ArcDifficulty, limit: number = 10, start: number = 0): Promise<IArcRankResponse>{

        let data = await this.get<IArcRankResponse>(`${baseUrl}${this.apiVersion}${friendRankUrl}`, {
                start,
                limit,
                song_id,
                difficulty
            });
        
        return data;
    }

    public async getWorldRank(song_id: string, difficulty: ArcDifficulty, start: number = 0, limit: number = 20): Promise<IArcRankResponse>{
        let data = await this.get<IArcRankResponse>(`${baseUrl}${this.apiVersion}${worldRankUrl}`, {
            start,
            limit,
            song_id,
            difficulty
        });

        return data;
    }

    public async getSelfRank(song_id: string, difficulty: ArcDifficulty, start: number = 4, limit: number = 18): Promise<IArcSelfRankResponse>{
        let data = await this.get<IArcSelfRankResponse>(`${baseUrl}${this.apiVersion}${selfRankUrl}`, {
            start,
            limit,
            song_id,
            difficulty
        });

        return data;
    }

    public async purchaseFriend(): Promise<IArcPurchaseFriendResponse>{
        let data = await this.post<IArcPurchaseFriendResponse>(`${baseUrl}${this.apiVersion}${purchaseUrl}`, '');
        return data;
    }
}