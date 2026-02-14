import { Test, TestingModule } from '@nestjs/testing';
import { PostsService } from './posts.service';
import { IPostReadRepository } from './post-read-repository.interface';
import { IPostWriteRepository } from './post-write-repository.interface';
import { Post } from './entities/post.entity';
import { CreatePostRequestDto } from './dto/request/create-post.request.dto';

describe('PostsService', () => {
  let service: PostsService;
  let mockReadRepository: jest.Mocked<IPostReadRepository>;
  let mockWriteRepository: jest.Mocked<IPostWriteRepository>;

  const now = new Date();

  const mockPost: Post = {
    id: 1,
    title: 'Test Title',
    content: 'Test Content',
    isPublished: false,
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(async () => {
    mockReadRepository = {
      findById: jest.fn(),
      findAll: jest.fn(),
    } as jest.Mocked<IPostReadRepository>;

    mockWriteRepository = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as jest.Mocked<IPostWriteRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: IPostReadRepository, useValue: mockReadRepository },
        { provide: IPostWriteRepository, useValue: mockWriteRepository },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
  });

  describe('findById', () => {
    it('should call repository.findById and return a post', async () => {
      mockReadRepository.findById.mockResolvedValue(mockPost);

      const result = await service.findById(1);

      expect(mockReadRepository.findById).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockPost);
    });

    it('should return null when post not found', async () => {
      mockReadRepository.findById.mockResolvedValue(null);

      const result = await service.findById(999);

      expect(mockReadRepository.findById).toHaveBeenCalledWith(999);
      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should call repository.findAll and return posts', async () => {
      const posts = [mockPost];
      mockReadRepository.findAll.mockResolvedValue(posts);

      const result = await service.findAll();

      expect(mockReadRepository.findAll).toHaveBeenCalled();
      expect(result).toEqual(posts);
    });

    it('should return an empty array when no posts exist', async () => {
      mockReadRepository.findAll.mockResolvedValue([]);

      const result = await service.findAll();

      expect(mockReadRepository.findAll).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('should call repository.create and return the created post', async () => {
      const dto: CreatePostRequestDto = {
        title: 'New Post',
        content: 'New Content',
      };
      mockWriteRepository.create.mockResolvedValue(mockPost);

      const result = await service.create(dto);

      expect(mockWriteRepository.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockPost);
    });
  });
});
